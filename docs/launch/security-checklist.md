# Launch Security Checklist

- [x] Admin Proxy performs early signed-claim rejection.
- [x] Protected layout, APIs and server actions repeat server authorization.
- [x] RLS is enabled on every application table.
- [x] Unauthorized PostgreSQL mutations fail in automated tests.
- [x] Auth hooks verify Standard Webhooks signatures.
- [x] Publishing worker/coordinator/Cron require independent secrets.
- [x] Public app uses only safe views and publishable credentials.
- [x] Private media original key is absent from `published_media`.
- [x] Browser bundle credential scanner passes locally.
- [x] Public/Admin CSP, no-sniff, referrer and frame controls configured.
- [x] Admin is disallowed from indexing; public internal APIs are disallowed in robots.
- [ ] Production founder GitHub login succeeds.
- [ ] Production unauthorized GitHub login is rejected.
- [ ] Production Auth hooks and session revocation verified.
- [ ] Production Storage policies tested using public, unauthorized and founder contexts.
- [ ] Deployed bundles scanned with actual secret sentinels.
- [ ] Cloudflare/Vercel TLS and headers inspected.
- [ ] Supabase organization recovery, GitHub recovery codes and session revocation rehearsed.
