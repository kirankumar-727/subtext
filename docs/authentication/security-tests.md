# Authentication Security Test Matrix

| Requirement                           | Automated verification                                                                                           |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| A. Unauthenticated `/admin`           | `proxy-boundary.test.ts` asserts redirect to `/login` and cookie preservation                                    |
| B. Founder can access                 | `authorization-core.test.ts` verifies fresh claims + user; proxy and API tests accept founder                    |
| C. Unauthorized Google account denied | core, hook-policy, and proxy tests reject mismatched email/claim                                                 |
| D. Unauthorized protected API         | proxy test and actual protected route handler return 401/403                                                     |
| E. Unauthorized server action         | direct invocation of `protectedAdminActionProbe` rejects before operation                                        |
| F. Unauthenticated database access    | `scripts/auth/validate-rls.mjs` executes as PostgreSQL `anon` and confirms rejection                             |
| G. Unauthorized database mutation     | RLS test executes as non-admin `authenticated` and confirms rejection                                            |
| H. Authorized admin operation         | RLS test executes with signed-claim shape and confirms mutation succeeds                                         |
| I. Logout                             | server-action helper test verifies global Supabase sign-out                                                      |
| J. Expired/invalid session            | core test makes fresh `getUser()` fail and confirms unauthenticated result                                       |
| K. Service credential exposure        | post-build scanner checks browser assets and mandatory `server-only` modules                                     |
| L. Direct URL access                  | proxy tests call `/admin/direct-url` and `/api/admin/session` directly                                           |
| Admission hook                        | hook-policy tests admit only exact Google founder identity                                                       |
| RLS claim hook                        | hook-policy tests grant `user_role=admin` only to founder and erase forged claims                                |
| Regression                            | root `npm run check` runs formatting, lint, types, all tests, generated-artifact checks, builds, and bundle scan |

## Commands

- `npm run auth:validate`
- `npm run auth:test:rls`
- `npm run test`
- `npm run build`
- `npm run auth:verify-bundles`
- `npm run check`

The test suite verifies server/database decisions. UI visibility is not treated as authorization evidence.
