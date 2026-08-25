# Known Limitations at Launch

- Production deployment and real GitHub OAuth have not been executed from this workspace.
- `subtext.media` currently serves an unrelated Shopify storefront; DNS/ownership must be resolved before cutover.
- `admin.subtext.media` currently has no resolvable DNS record.
- Free-tier availability has no production SLA; Supabase may pause low-activity projects.
- Vercel Hobby use is permitted only while the deployment meets current non-commercial terms.
- Production backup/PITR is limited on free tiers; independent logical exports remain required.
- Full advanced revision diff is deferred; immutable history and rollback exist.
- The public website has no comments, accounts, personalization, newsletter, paywall or analytics by design.
- Search is English PostgreSQL FTS/trigram; no multilingual or external engine.
- Publishing verification depends on the public application and Supabase availability; failures remain observable/retryable.
