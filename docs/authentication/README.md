# Subtext Authentication and Admin Access

## Scope

Milestone 3 establishes the security boundary for the private, single-founder Admin Workspace. It intentionally contains no CMS, editor, media library, publishing UI, or analytics functionality.

## Authentication architecture

Subtext uses only GitHub OAuth through Supabase Auth. GitHub proves identity; Subtext separately decides whether that verified identity is the one configured founder.

Security is enforced at independent layers:

1. **Admission:** a signed Supabase Before User Created HTTP hook rejects every new identity except the exact founder GitHub email.
2. **Token authorization:** a signed Custom Access Token hook adds `user_role=admin` only to the exact founder GitHub identity. Every other token receives `user_role=null`.
3. **Session verification:** Next.js Proxy calls `getClaims()` to verify/refresh the request token. Protected pages then call both `getClaims()` and `getUser()` before returning data.
4. **Application authorization:** the fresh Auth user, verified claims, GitHub provider, confirmed email, exact server-only founder email, subject ID, anonymous flag, and admin claim must all agree.
5. **Route/API/action authorization:** `/admin`, `/admin/*`, `/api/*`, and privileged server actions call the shared server guard. Proxy is only an early rejection layer.
6. **Database authorization:** the request-scoped Supabase client carries the signed JWT. M2 RLS permits editorial mutations only when `private.is_admin()` sees `user_role=admin`.
7. **Privileged-client authorization:** the RLS-bypassing secret client can only be created through `withAuthorizedAdminClient`, after the complete server guard succeeds.

## Authentication flow

1. The visitor opens `admin.subtext.media/login`.
2. The server action starts Supabase GitHub OAuth with PKCE and an exact callback URL.
3. GitHub authenticates the selected account and returns to Supabase Auth.
4. Before account creation, Supabase invokes the signed admission hook. Wrong email or provider is rejected.
5. Before token issuance, Supabase invokes the signed token hook. Only the founder receives `user_role=admin`.
6. Supabase returns an authorization code to `/auth/callback`.
7. The callback exchanges the code for secure host-only cookies.
8. The callback uses `getClaims()` and a fresh `getUser()` response, then compares the verified identity with server-only `FOUNDER_EMAIL`.
9. Authorized founder sessions continue to `/admin`; every failed authorization is signed out and sent to Access Denied.
10. Every later protected request repeats signature/expiry verification, fresh user verification, authorization, and RLS enforcement.

See [authentication-flow.svg](./authentication-flow.svg) for the generated flow diagram.

## Authorization flow

Authentication and authorization are deliberately separate. A valid Supabase session is necessary but insufficient.

The application authorizes only when all conditions hold:

- JWT signature and expiry validate through `getClaims()`;
- Auth server returns the current user through `getUser()`;
- token subject equals the verified user ID;
- user and claim email exactly match normalized server-only `FOUNDER_EMAIL`;
- email is confirmed;
- the sole provider is GitHub;
- user/session is not anonymous;
- the signed token has `user_role=admin`.

No browser boolean, URL, hidden component, OAuth success, or unverified cookie can grant access.

## Session lifecycle

- OAuth is initiated by a server action; no access or refresh token is intentionally exposed to application client code.
- Supabase SSR stores the PKCE/session material in host-only cookies.
- Cookie writes force `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` in production.
- Next.js Proxy calls `getClaims()` immediately after creating the request-scoped client. Near-expiry access tokens are refreshed and response cookies are synchronized.
- Protected server code also calls `getUser()` so revoked/deleted sessions and current identity data are checked against Supabase Auth.
- Missing, invalid, or expired sessions receive a login redirect for pages and HTTP 401 for APIs.
- Logout uses global Supabase sign-out, clears the current cookies, revokes active refresh sessions, and returns to login.
- Admin responses are private and `no-store`.

## Route and operation protection

| Surface                        | Early proxy behavior                                                       | Authoritative behavior                                                                     |
| ------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `/admin`, `/admin/*`           | Redirect missing session to `/login`; mismatched claim to `/access-denied` | Server page calls `requireAdminPage()` before any protected data access                    |
| `/api`, `/api/*`               | JSON 401/403                                                               | Handler is wrapped with `withAdminApi()` and calls the fresh server guard                  |
| Privileged server actions      | Proxy may reject the page request                                          | Every action calls `requireAdmin()` itself                                                 |
| RLS-scoped database operations | No database work in Proxy                                                  | Request-scoped Supabase client sends the founder JWT; RLS independently checks `user_role` |
| RLS-bypassing operations       | Never created in client/proxy                                              | `withAuthorizedAdminClient()` authorizes before creating the secret client                 |
| Auth hooks                     | Not an admin route                                                         | Supabase Edge Functions verify Standard Webhooks signatures and fail closed                |

## RLS interaction

M2 remains unchanged. `private.is_admin()` trusts only the cryptographically signed `user_role` JWT claim. The Custom Access Token hook is the only component that grants that claim, and it reads `FOUNDER_EMAIL` from Supabase Edge Function secrets.

- Anonymous role has no access to protected editorial tables.
- Authenticated non-admin tokens fail founder mutation policies.
- Founder tokens use the normal request-scoped client and pass RLS.
- Secret/service clients bypass RLS by design, so application code must first pass `requireAdmin()` and use the explicit privileged gateway.

## Security model

### Protected secrets

The following remain server/deployment only:

- `FOUNDER_EMAIL`
- `SUPABASE_SECRET_KEY`
- GitHub OAuth client secret
- Auth hook signing secrets
- Supabase management access token
- database credentials

`NEXT_PUBLIC_SUPABASE_URL`, the publishable key, and public application URLs are intentionally public and carry no authorization power.

### Signed Auth hooks

Both HTTP hooks disable JWT verification because they execute before a user JWT exists. They instead verify the raw body plus `webhook-id`, `webhook-timestamp`, and `webhook-signature` using independent Standard Webhooks secrets. Invalid method, signature, payload, missing founder configuration, wrong provider, or wrong email fails closed.

### Privacy controls

- `robots.txt` disallows the entire Admin host.
- Metadata and response headers set `noindex`, `nofollow`, `noarchive`.
- Admin pages are absent from public navigation and public sitemaps.
- CSP, frame denial, no-sniff, no-referrer, no-store, and restrictive permissions headers are applied.
- Protected APIs return only generic 401/403 codes.
- Access Denied does not disclose the configured identity.
- Client-bundle verification fails CI if privileged environment names or configured secret values appear in browser assets.

## Failure scenarios

| Scenario                                          | Result                                                                            |
| ------------------------------------------------- | --------------------------------------------------------------------------------- |
| No cookie/session                                 | Page redirects to Login; API returns 401                                          |
| Expired or invalid JWT                            | `getClaims()` fails; protected request is rejected                                |
| Revoked/deleted Auth user                         | fresh `getUser()` fails; protected request is rejected                            |
| Valid unauthorized GitHub session                 | Access Denied; API/action returns 403; RLS rejects mutations                      |
| Wrong OAuth provider                              | admission hook rejects creation; existing session lacks admin claim and is denied |
| Matching email without admin claim                | denied; this detects missing/misconfigured token hook                             |
| Forged client admin flag                          | ignored; no server or database decision reads it                                  |
| Direct protected URL/API/action call              | same guards run; no data is loaded before authorization                           |
| Auth hook signature invalid                       | hook returns generic 401 and performs no authorization change                     |
| Founder environment missing                       | authorization fails closed                                                        |
| Supabase secret accidentally imported client-side | `server-only` build guard and bundle scanner fail                                 |
| Auth hook unavailable                             | account creation/token issuance fails rather than granting access                 |

## Logout behavior

Logout is deliberately available from both the protected workspace and Access Denied. It performs Supabase global sign-out and redirects to `/login`. A subsequent direct request to `/admin`, API call, or server-action call must be rejected.

## Local and production setup

See [github-oauth-setup.md](./github-oauth-setup.md).

## Security tests

See [security-tests.md](./security-tests.md) for the requirement-to-test matrix and commands.
