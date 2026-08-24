# Subtext MVP Launch Readiness

**Status: NOT YET PRODUCTION-VALIDATED**  
**Repository assessment date: 24 August 2026**

The automated tests and source validations pass, but the repository still has a documented 12-file formatting baseline exception. Production launch cannot yet be declared because the production platform is not deployed/configured in this workspace and no real founder-authenticated CMS publication has been executed.

The 9 August 2026 domain audit recorded three external observations that require fresh operator verification before any production cutover:

1. `https://subtext.media` was recorded as resolving to `23.227.38.66` and serving a Shopify storefront, not this Subtext Media application.
2. `admin.subtext.media` was recorded as absent from DNS.
3. Authoritative nameservers were recorded as Google Domains (`ns-cloud-d*.googledomains.com`), not Cloudflare.

These are historical non-secret observations, not a current Arena verification. No private Supabase, GitHub or Vercel credentials are present—and none should be supplied in chat—so GitHub login, Auth hooks, production RLS, Storage, worker, Cron, revalidation and the real article lifecycle remain pending operator execution. See [domain-audit.md](./domain-audit.md) for the recorded DNS evidence.

## Initial staging boundary

- Initial staging uses only stable HTTPS `.vercel.app` URLs; do not attach `subtext.media` or `admin.subtext.media` and do not change DNS.
- The staging source is branch `arena/01a02e28-subtext` at commit `fc78a24e99d259019a253d25d67224f6d58a9e1c`.
- Run staging environment checks with `SUBTEXT_ENVIRONMENT=staging`; run production checks with `SUBTEXT_ENVIRONMENT=production`. The launch validator rejects an absent or invalid mode.
- Supabase, Vercel, GitHub OAuth, deployment and DNS actions are authorized operator actions, not Arena actions.

## Pre-deployment gates passed

- All M1–M6 automated tests and production builds; the 12-file formatting baseline exception remains documented above
- Migration apply, rollback and generated-contract checks
- Authentication/RLS/route/API/action boundaries
- CMS atomic revisions and local recovery behavior
- Publishing concurrency, retries, rollback, unpublish and recovery
- Public projection, search, redirect, sitemap/RSS and SEO component tests
- Edge Function Deno type checks and signed-hook tests
- Browser bundle secret scan
- Public JavaScript/CSS build budgets
- Generated documentation synchronization

## Remaining launch gates

- Resolve domain ownership/intent and replace the current Shopify DNS only when authorized.
- Create/configure isolated Supabase production and staging projects.
- Configure GitHub OAuth and both signed Auth hooks.
- Deploy Vercel Public/Admin and the Supabase publishing worker.
- Run `SUBTEXT_ENVIRONMENT=production npm run launch:env -- --target=all` against private production configuration.
- Use the actual authenticated CMS to create the launch-validation story.
- Complete publish/update/rollback/unpublish/republish tests against deployed URLs.
- Complete manual mobile, tablet and desktop review.
- Run production black-box validation in published and unpublished modes.

Do not label the MVP production-ready until every item in the production readiness checklist is signed off.
