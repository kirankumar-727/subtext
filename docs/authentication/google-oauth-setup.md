# Google OAuth and Founder Allowlist Setup

No database or Auth setting should be changed manually without an equivalent committed configuration or deployment command.

## Required environment variables

### Admin application — Vercel server environment

- `NEXT_PUBLIC_ADMIN_URL`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `FOUNDER_EMAIL` — server-only exact Google email
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
- `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`
- `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`

The management access token is used only from a trusted operator machine or protected CI environment.

## Google Cloud configuration

Create one OAuth 2.0 Web Application client for each isolated Supabase environment.

Authorized Google redirect URIs:

- Local: `http://127.0.0.1:54321/auth/v1/callback`
- Staging: `https://<STAGING_PROJECT_REF>.supabase.co/auth/v1/callback`
- Production: `https://<PRODUCTION_PROJECT_REF>.supabase.co/auth/v1/callback`

Google returns to Supabase Auth, not directly to Next.js. Supabase then redirects to the exact application callback:

- Local: `http://localhost:3001/auth/callback`
- Production: `https://admin.subtext.media/auth/callback`

Request only `openid email profile`. No Google API scopes are required.

## Local development

1. Copy `apps/admin/.env.example` to `apps/admin/.env.local` and configure public Supabase values plus `FOUNDER_EMAIL`.
2. Copy `supabase/functions/.env.example` to `supabase/functions/.env` and configure founder/hook secrets.
3. Export `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` for the Supabase CLI.
4. Start the Admin app on port 3001.
5. Start local Supabase and its Edge Function runtime with Docker available.
6. Confirm `supabase/config.toml` has email, phone, and anonymous signup disabled; Google enabled; and both signed HTTP hooks enabled.
7. Register the local Supabase callback URI in Google Cloud.
8. Test founder login, wrong-account rejection, logout, expired session, direct URL, API, server action, and RLS behavior.

Local Auth hook URIs use `host.docker.internal` so the Auth container can reach the local function gateway.

## Production deployment

1. Deploy both Auth hook functions without JWT verification. Payload authenticity is provided by Standard Webhooks signatures:

   - `supabase functions deploy before-user-created --no-verify-jwt`
   - `supabase functions deploy custom-access-token --no-verify-jwt`

2. Set Edge Function secrets with `supabase secrets set --env-file <secure-file>`.
3. Configure the Admin Vercel project environment, keeping founder and secret values server-only.
4. Configure Google OAuth and the signed Auth hooks through the committed management script:

   - Validate: `npm run auth:configure`
   - Apply: `npm run auth:configure -- --apply`

5. Confirm the Supabase Auth provider screen shows:

   - Google enabled
   - email/password disabled
   - phone disabled
   - anonymous users disabled
   - all other social providers disabled
   - Before User Created HTTP hook enabled
   - Custom Access Token HTTP hook enabled
   - exact Admin callback allowlist

6. Run the complete repository quality gate.
7. Perform a production founder sign-in and immediately verify a wrong Google account is denied.

## Secret rotation

1. Generate a new independent Standard Webhooks secret.
2. Configure both old and new secret values according to Supabase hook secret-rotation support.
3. deploy/update the Edge Function secret.
4. verify signed test payloads.
5. retire the old secret.

Rotate Google, Supabase, and Vercel credentials independently. Never place secrets in migrations, seed data, source code, generated documentation, or client-visible environment variables.
