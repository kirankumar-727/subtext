# GitHub OAuth and Founder Allowlist Setup

Subtext uses GitHub OAuth through Supabase Auth. GitHub proves identity; Subtext separately decides whether that verified identity is the configured founder.

Staging and production provider, hook, and deployment changes are authorized operator actions. Arena can inspect this repository but must not execute or claim those external actions.

No database or Auth setting should be changed manually without an equivalent committed configuration or an approved deployment command.

## Required environment variables

### Admin application — Vercel server environment

- `NEXT_PUBLIC_ADMIN_URL`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `FOUNDER_EMAIL` — server-only exact GitHub email
- `SUPABASE_SECRET_KEY` — only for explicitly authorized privileged operations

Do not configure `FOUNDER_EMAIL` or any secret with a `NEXT_PUBLIC_` prefix.

### Supabase Edge Function secrets

- `FOUNDER_EMAIL`
- `BEFORE_USER_CREATED_HOOK_SECRET`
- `CUSTOM_ACCESS_TOKEN_HOOK_SECRET`

The hook secrets must be independent values in `v1,whsec_<base64>` format.

### Deployment-only configuration

- `SUPABASE_PROJECT_REF`
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID`
- `SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET`

The management access token and GitHub OAuth secret must be used only from a trusted operator machine or protected CI environment.

## GitHub Developer configuration

Create one GitHub OAuth App for each isolated Supabase environment.

In GitHub, open **Settings → Developer settings → OAuth Apps → New OAuth App** and configure:

- Application name: the environment-specific Subtext Admin name;
- Homepage URL: the stable Admin application URL;
- Authorization callback URL: the Supabase Auth callback, not the Next.js callback:
  - Local: `http://127.0.0.1:54321/auth/v1/callback`
  - Staging: `https://<STAGING_PROJECT_REF>.supabase.co/auth/v1/callback`
  - Production: `https://<PRODUCTION_PROJECT_REF>.supabase.co/auth/v1/callback`

Store the GitHub Client ID and Client Secret outside the repository. Subtext requests only the GitHub identity scopes needed for the configured OAuth flow: `read:user user:email`.

GitHub returns to Supabase Auth. Supabase then redirects to the exact application callback:

- Local: `http://localhost:3001/auth/callback`
- Staging: `https://<ADMIN_STAGING_HOST>/auth/callback`
- Production: `https://admin.subtext.media/auth/callback`

Use only the staging callback during initial staging activation. Do not add production custom domains to the staging OAuth App.

## Supabase Auth configuration

In the relevant Supabase project, open **Authentication → Providers → GitHub** and enable only GitHub with the environment-specific Client ID and Client Secret.

Keep email/password, phone, anonymous sign-in, and all other social providers disabled. Enable both signed HTTP hooks:

- Before User Created;
- Custom Access Token.

The active provider configuration must use the same GitHub variable names as the committed configuration script:

- `SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID`
- `SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET`

## Local development

1. Copy `apps/admin/.env.example` to `apps/admin/.env.local` and configure public Supabase values plus `FOUNDER_EMAIL`.
2. Copy `supabase/functions/.env.example` to `supabase/functions/.env` and configure founder and hook secrets.
3. Export the GitHub OAuth variables for the Supabase CLI.
4. Start the Admin app on port 3001.
5. Start local Supabase and its Edge Function runtime with Docker available.
6. Confirm `supabase/config.toml` has email, phone, and anonymous signup disabled; GitHub enabled; and both signed HTTP hooks enabled.
7. Register the local Supabase callback URI in the GitHub OAuth App.
8. Test founder login, wrong-account rejection, logout, expired session, direct URL, API, server action, and RLS behavior.

Local Auth hook URIs use `host.docker.internal` so the Auth container can reach the local function gateway.

## Production deployment

1. Deploy both Auth hook functions without JWT verification. Payload authenticity is provided by Standard Webhooks signatures:

   - `supabase functions deploy before-user-created --no-verify-jwt`
   - `supabase functions deploy custom-access-token --no-verify-jwt`

2. Set Edge Function secrets with `supabase secrets set --env-file <secure-file>`.
3. Configure the Admin Vercel project environment, keeping founder and secret values server-only.
4. Validate the committed Auth configuration without applying it:

   - `npm run auth:configure`

5. Apply it only from an approved secure operator environment:

   - `npm run auth:configure -- --apply`

6. Confirm the Supabase Auth provider screen shows:

   - GitHub enabled;
   - email/password disabled;
   - phone disabled;
   - anonymous users disabled;
   - all other social providers disabled;
   - Before User Created HTTP hook enabled;
   - Custom Access Token HTTP hook enabled;
   - exact Admin callback allowlist.

7. Run the complete repository quality gate.
8. Perform a production founder sign-in and immediately verify a wrong GitHub account is denied.

## Secret rotation

1. Generate new independent Standard Webhooks secrets.
2. Configure both old and new values according to the provider's supported rotation procedure.
3. Update the Edge Function secrets.
4. Verify signed test payloads and both hook paths.
5. Retire the old secrets.

Rotate GitHub, Supabase, Vercel, worker, revalidation, and Cron credentials independently. Never place secrets, the founder's real email, or provider credentials in migrations, seed data, source code, generated documentation, or client-visible environment variables.
