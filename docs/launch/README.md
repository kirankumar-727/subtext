# Subtext MVP Launch Readiness

**Status: NOT YET PRODUCTION-VALIDATED**  
**Assessment date: 9 August 2026**

The implementation and complete local quality gate pass. Production launch cannot yet be declared because the production platform is not deployed/configured in this workspace and no real founder-authenticated CMS publication has been executed.

Two externally observed blockers are material:

1. `https://subtext.media` currently resolves to `23.227.38.66` and serves a Shopify storefront, not this Subtext Media application.
2. `admin.subtext.media` does not currently resolve in DNS.
3. Authoritative nameservers currently resolve to Google Domains (`ns-cloud-d*.googledomains.com`), not Cloudflare.

No private Supabase, GitHub or Vercel credentials are present—and none should be supplied in chat—so GitHub login, Auth hooks, production RLS, Storage, worker, Cron, revalidation and the real article lifecycle remain pending operator execution. See [domain-audit.md](./domain-audit.md) for the non-secret DNS evidence.

## Pre-deployment gates passed

- All M1–M6 automated tests and production builds
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
- Run the environment contract against private production configuration.
- Use the actual authenticated CMS to create the launch-validation story.
- Complete publish/update/rollback/unpublish/republish tests against deployed URLs.
- Complete manual mobile, tablet and desktop review.
- Run production black-box validation in published and unpublished modes.

Do not label the MVP production-ready until every item in the production readiness checklist is signed off.
