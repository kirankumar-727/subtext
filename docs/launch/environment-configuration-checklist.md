# Production Environment Configuration Checklist

Generated from `scripts/launch/environment-contract.mjs`. Secret values must never be committed, logged, pasted into chat, or prefixed with `NEXT_PUBLIC_`.

| Target | Variable | Configure in | Validation | Status |
|---|---|---|---|---|
| public | `NEXT_PUBLIC_SITE_URL` | Vercel Public | https-url | Required |
| public | `NEXT_PUBLIC_SUPABASE_URL` | Vercel Public | https-url | Required |
| public | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel Public | publishable-key | Required |
| public | `REVALIDATION_SECRET` | Vercel Public | secret | Required |
| public | `PUBLISHING_WORKER_SECRET` | Vercel Public | secret | Required |
| public | `CRON_SECRET` | Vercel Public | secret | Required |
| admin | `NEXT_PUBLIC_SITE_URL` | Vercel Admin | https-url | Required |
| admin | `NEXT_PUBLIC_ADMIN_URL` | Vercel Admin | https-url | Required |
| admin | `NEXT_PUBLIC_SUPABASE_URL` | Vercel Admin | https-url | Required |
| admin | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel Admin | publishable-key | Required |
| admin | `FOUNDER_EMAIL` | Vercel Admin | email | Required |
| admin | `PUBLISHING_WORKER_SECRET` | Vercel Admin | secret | Required |
| supabase-functions | `SUPABASE_URL` | Supabase Edge Functions | https-url | Platform-provided; verify |
| supabase-functions | `SUPABASE_SECRET_KEYS` | Supabase Edge Functions | secret-json | Platform-provided; verify |
| supabase-functions | `FOUNDER_EMAIL` | Supabase Edge Functions | email | Required |
| supabase-functions | `BEFORE_USER_CREATED_HOOK_SECRET` | Supabase Edge Functions | webhook-secret | Required |
| supabase-functions | `CUSTOM_ACCESS_TOKEN_HOOK_SECRET` | Supabase Edge Functions | webhook-secret | Required |
| supabase-functions | `PUBLISHING_WORKER_SECRET` | Supabase Edge Functions | secret | Required |
| supabase-functions | `PUBLICATION_API_URL` | Supabase Edge Functions | https-url | Required |
| supabase-functions | `REVALIDATION_SECRET` | Supabase Edge Functions | secret | Required |
| operator | `SUPABASE_PROJECT_REF` | Operator/CI only | project-ref | Required |
| operator | `SUPABASE_ACCESS_TOKEN` | Operator/CI only | secret | Required |
| operator | `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` | Operator/CI only | google-client | Required |
| operator | `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` | Operator/CI only | secret | Required |
| operator | `BEFORE_USER_CREATED_HOOK_SECRET` | Operator/CI only | webhook-secret | Required |
| operator | `CUSTOM_ACCESS_TOKEN_HOOK_SECRET` | Operator/CI only | webhook-secret | Required |
| operator | `NEXT_PUBLIC_ADMIN_URL` | Operator/CI only | https-url | Required |
| operator | `NEXT_PUBLIC_SUPABASE_URL` | Operator/CI only | https-url | Required |

## Configuration commands

- Validate one target: `npm run launch:env -- --target=public`
- Validate all targets from a secure operator environment: `npm run launch:env -- --target=all`
- Apply Supabase Auth provider/hook configuration: `npm run auth:configure -- --apply`
- Deploy Edge Functions using Supabase CLI; do not put function secrets in Vercel browser variables.

## Non-environment configuration

- Supabase production project region, migrations, RLS, Storage buckets and Edge Functions deployed.
- Google OAuth production client authorizes only the Supabase callback URI.
- Vercel Public root is `apps/public`; Admin root is `apps/admin`.
- Cloudflare is authoritative DNS. Vercel records remain DNS-only unless double-proxy behavior is tested.
- Preserve existing MX/TXT mail records when changing nameservers.
