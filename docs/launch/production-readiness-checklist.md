# Production Readiness Checklist

This checklist is production-only. It does not authorize initial staging activation, production DNS changes, or production deployment. Keep every item unchecked until an authorized operator supplies the required evidence.

## Infrastructure

- [ ] Confirm legal/operational control of `subtext.media`; the recorded domain audit describes an unrelated Shopify storefront at the origin and requires fresh operator verification.
- [ ] Confirm Cloudflare zone and registrar access; inventory existing DNS/MX/TXT records before changes.
- [ ] Create Supabase production project in the approved region.
- [ ] Apply all migrations only through CLI/CI.
- [ ] Confirm RLS, public views, both Storage buckets and `pg_trgm`.
- [ ] Deploy Auth hooks and publishing worker.
- [ ] Create Vercel Public and Admin projects with correct monorepo roots.
- [ ] Configure `subtext.media` and `admin.subtext.media` TLS/DNS.
- [ ] Confirm Vercel plan eligibility before commercial use.
- [ ] Confirm Cron executes `/api/internal/publishing-tick` on schedule.

## Identity and secrets

- [ ] Run `SUBTEXT_ENVIRONMENT=production npm run launch:env -- --target=all` in a secure environment.
- [ ] Configure GitHub OAuth callback URIs.
- [ ] Apply Supabase Auth configuration using the committed script.
- [ ] Verify wrong GitHub identity is rejected before account creation.
- [ ] Verify founder receives `user_role=admin` and RLS access.
- [ ] Confirm all secrets are distinct and server-only.
- [ ] Run browser bundle credential scan on deployed build artifacts.

## Data and workflow

- [ ] Create the validation article through the real CMS—not SQL/Studio.
- [ ] Upload founder-owned/licensed cover and inline image through Media.
- [ ] Add source/citation and SEO metadata through CMS.
- [ ] Publish revision A and verify all public surfaces.
- [ ] Publish revision B and roll back to A.
- [ ] Unpublish and verify complete public removal.
- [ ] Republish and verify restoration.
- [ ] Verify publication events and audit trail.
- [ ] Simulate/recover expired lease, duplicate dispatch and verification failure.

## Reader experience

- [ ] Review homepage, four pillars, article, search, about, 404 and errors.
- [ ] Review mobile (narrow phone), tablet and desktop.
- [ ] Verify typography, image crops, citations, embeds, footer and navigation.
- [ ] Validate current canonical URL, old URL 301 and unknown URL 404.
- [ ] Validate Search, sitemap and RSS after publish and unpublish.
- [ ] Validate SEO metadata and JSON-LD.
- [ ] Run performance checks on production CDN responses.

## Sign-off

- [ ] Founder approves editorial rendering and final article.
- [ ] Security checklist complete.
- [ ] SEO checklist complete.
- [ ] Performance checklist complete.
- [ ] Backup and rollback procedures rehearsed.
- [ ] Production black-box validator passes in published and absent modes.
