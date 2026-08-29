# Incident Recovery Procedure

## Triage

1. Preserve evidence: timestamp, affected URL/job ID, provider status and non-secret logs.
2. Determine scope: Auth, Admin, database, Storage, worker, public coordinator, Vercel, DNS or Cloudflare.
3. Revoke/rotate credentials immediately if exposure is suspected.
4. Do not paste tokens, cookies, founder email or private content into public tickets.

## Publishing incident

- Inspect `publication_jobs` and ordered `publication_events` through authorized Admin/server tools.
- Expired processing/committed/verifying leases are reclaimable.
- Retry transient network/provider failures; dead-letter validation failures require content correction and a new request.
- `published_pending_verification` is not a silent success; restore public coordinator and re-dispatch.
- Use immutable rollback or unpublish for reader-facing harm.

## Auth compromise

- Revoke all Supabase sessions.
- Secure/recover the founder GitHub account and rotate GitHub OAuth secret.
- Rotate hook, worker, revalidation, Cron, Supabase and Vercel secrets independently.
- Verify unauthorized users never received the admin claim or RLS access.

## Data loss/corruption

- Freeze writes.
- Capture current database/Storage inventory.
- Restore into staging first from managed or encrypted logical backup.
- Validate revision checksums, media checksums, RLS and publication projections.
- Cut over only after the complete quality and E2E workflow passes.

## DNS/origin incident

- Preserve registrar and mail records.
- Revert only the affected A/CNAME record; do not disturb MX/TXT records.
- Purge stale edge cache after origin restoration.
- Re-run TLS, canonical, redirect, sitemap and RSS validation.
