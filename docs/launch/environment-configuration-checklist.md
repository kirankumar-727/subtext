# Environment Configuration Checklist

Generated from `scripts/launch/environment-contract.mjs`. Secret values must never be committed, logged, pasted into chat, or prefixed with `NEXT_PUBLIC_`.

## Explicit environment mode

Set `SUBTEXT_ENVIRONMENT` explicitly in the secure validation environment to exactly one of:

- `production`
- `staging`

The validator fails closed when the mode is absent or invalid. The mode is a validation selector; it is not a substitute for the required target variables.

| Target | Variable | Configure in | Validation | Status |
|---|---|---|---|---|
| public | `NEXT_PUBLIC_SITE_URL` | Vercel Public | https-url | Required |
| public | `NEXT_PUBLIC_SUPABASE_URL` | Vercel Public | https-url | Required |
| public | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel Public | publishable-key | Required |
| public | `REVALIDATION_SECRET` | Vercel Public | secret | Required |
| public | `PUBLISHING_WORKER_SECRET` | Vercel Public | secret | Required |
| public | `CRON_SECRET` | Vercel Public | secret | Required |
| public | `PUBLIC_MEDIA_SIGNER_SECRET` | Vercel Public | secret | Required |
| admin | `NEXT_PUBLIC_SITE_URL` | Vercel Admin | https-url | Required |
| admin | `NEXT_PUBLIC_ADMIN_URL` | Vercel Admin | https-url | Required |
| admin | `NEXT_PUBLIC_SUPABASE_URL` | Vercel Admin | https-url | Required |
| admin | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel Admin | publishable-key | Required |
| admin | `SUPABASE_SECRET_KEY` | Vercel Admin | secret-key | Required |
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
| supabase-functions | `PUBLIC_MEDIA_SIGNER_SECRET` | Supabase Edge Functions | secret | Required |
| operator | `SUPABASE_PROJECT_REF` | Operator/CI only | project-ref | Required |
| operator | `SUPABASE_ACCESS_TOKEN` | Operator/CI only | secret | Required |
| operator | `SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID` | Operator/CI only | github-client | Required |
| operator | `SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET` | Operator/CI only | secret | Required |
| operator | `BEFORE_USER_CREATED_HOOK_SECRET` | Operator/CI only | webhook-secret | Required |
| operator | `CUSTOM_ACCESS_TOKEN_HOOK_SECRET` | Operator/CI only | webhook-secret | Required |
| operator | `NEXT_PUBLIC_ADMIN_URL` | Operator/CI only | https-url | Required |
| operator | `NEXT_PUBLIC_SUPABASE_URL` | Operator/CI only | https-url | Required |

## Origin policy

- **Production:** Public values must use exactly `https://subtext.media`; Admin values must use exactly `https://admin.subtext.media`.
- **Staging:** Public, Admin and `PUBLICATION_API_URL` values must be HTTPS origins matching a single stable `*.vercel.app` project host. Arbitrary domains and production custom domains are rejected.
- Supabase URLs must remain HTTPS. Provider-managed `SUPABASE_URL` and `SUPABASE_SECRET_KEYS` are verified in the Edge Function environment rather than copied into a browser environment.

## Configuration commands

- Validate one production target: `SUBTEXT_ENVIRONMENT=production npm run launch:env -- --target=public`
- Validate all production targets from a secure operator environment: `SUBTEXT_ENVIRONMENT=production npm run launch:env -- --target=all`
- Validate one staging target: `SUBTEXT_ENVIRONMENT=staging npm run launch:env -- --target=public`
- Validate all staging targets from a secure operator environment: `SUBTEXT_ENVIRONMENT=staging npm run launch:env -- --target=all`
- Apply Supabase Auth provider/hook configuration only from an approved secure operator environment: `npm run auth:configure -- --apply`
- Deploy Edge Functions using Supabase CLI; do not put function secrets in Vercel browser variables.

## Non-environment configuration

- Supabase project region, migrations, RLS, Storage buckets and Edge Functions must be verified or deployed by the authorized operator for the selected environment.
- GitHub OAuth clients must authorize only the exact Supabase callback URI for their isolated environment.
- Vercel Public root is `apps/public`; Admin root is `apps/admin`.
- Initial staging uses only stable `.vercel.app` URLs and does not attach production domains or change DNS.
- Preserve existing MX/TXT mail records during any future production DNS operation.
