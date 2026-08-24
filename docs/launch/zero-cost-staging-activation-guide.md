# Zero-Cost Staging Activation Guide

**Audience:** the single founder/operator  
**Purpose:** activate and validate Subtext using temporary provider URLs before any production DNS work  
**Rule:** never paste secrets into chat, source files, Git commits, screenshots, issue trackers or documentation

## Hard stop: production DNS

- **[DO NOT DO YET]** Do not edit any `subtext.media` DNS record.
- **[DO NOT DO YET]** Do not replace, disconnect or alter the existing Shopify storefront.
- **[DO NOT DO YET]** Do not delete, move or alter any MX/TXT record.
- **[DO NOT DO YET]** Do not add `subtext.media` or `admin.subtext.media` to Vercel during initial staging.
- **[FREE]** Use only the stable Vercel project URLs ending in `.vercel.app` for the initial end-to-end test.

The current domain audit shows the apex serving Shopify and the admin subdomain absent. Staging does not require changing either.

---

# A. Provider and cost map

| Component                       | Staging choice                                                   | Cost label               | Operator decision                                                                 |
| ------------------------------- | ---------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------- |
| Source/CI                       | Existing private GitHub repository and GitHub Free               | **[FREE]**               | Use the existing `main` branch and Actions allowance                              |
| Database/Auth/Storage/Functions | One Supabase Free project                                        | **[FREE]**               | Reserve the second free project for later production or isolated recovery testing |
| Public app                      | One Vercel Hobby project using its stable `.vercel.app` URL      | **[FREE]**               | Staging must remain non-commercial and within Hobby terms                         |
| Admin app                       | A second Vercel Hobby project using its stable `.vercel.app` URL | **[FREE]**               | The application’s GitHub/founder authorization remains the security boundary      |
| GitHub login                    | GitHub OAuth App                                                 | **[FREE]**               | Request only `read:user user:email`                                               |
| Publishing worker               | Supabase Edge Function                                           | **[FREE]**               | Stay within Free function invocation/resource limits                              |
| Recovery Cron                   | Vercel Hobby daily Cron plus immediate CMS dispatch              | **[FREE]**               | Hobby permits only one Cron execution per day                                     |
| DNS                             | No staging DNS change                                            | **[DO NOT DO YET]**      | Use `.vercel.app`; leave Shopify and mail records untouched                       |
| Commercial production hosting   | Vercel Pro or another commercially eligible managed host         | **[REQUIRES PAID PLAN]** | Required before commercial use under current Vercel Hobby terms                   |
| Production database reliability | Supabase Pro recommended                                         | **[REQUIRES PAID PLAN]** | Removes inactivity pause and adds stronger backup/availability options            |
| Cloudflare authoritative DNS    | Cloudflare Free can be used later                                | **[PRODUCTION ONLY]**    | Optional; not required for staging and not currently authoritative                |

## Free-tier limits to watch

**[FREE]** Supabase Free currently provides a small PostgreSQL database, Storage allowance, egress allowance and Edge Function invocation allowance. It can pause for low activity. This is acceptable for staging, not an uptime guarantee.

**[FREE]** Vercel Hobby can host both projects, but it is restricted to non-commercial personal use. It permits Cron only once per day. The repository therefore uses immediate worker dispatch for normal publishing and a daily Cron for recovery.

**[REQUIRES PAID PLAN]** A frequent recovery Cron such as every ten minutes requires Vercel Pro. Do not change the staging schedule to a frequent expression on Hobby; deployment will fail.

---

# B. Names and URLs to choose before starting

Choose project names once. Vercel project names determine stable staging URLs.

Suggested names, if available:

- Public Vercel project: `subtext-public-staging`
- Public URL: `https://subtext-public-staging.vercel.app`
- Admin Vercel project: `subtext-admin-staging`
- Admin URL: `https://subtext-admin-staging.vercel.app`
- Supabase project: `subtext-staging`
- Supabase URL: `https://<STAGING_PROJECT_REF>.supabase.co`

If Vercel changes a project name because it is unavailable, record the actual stable URLs and use them everywhere below. Do not use a commit-specific preview URL for OAuth or the publishing coordinator.

Create a private operator note outside the repository containing only variable names and provider locations. Store actual values in a password manager and provider secret stores.

---

# C. Exact zero-cost activation sequence

## Step 0 — Local preflight

- **[FREE]** Install Git, Node.js 22, npm 11 and a browser.
- **[FREE]** Clone the private repository.
- **[FREE]** Check out commit `acad624` or a later reviewed M7-hardening commit.
- **[FREE]** Run:

```text
npm ci
npm run check
```

Expected: every migration, auth, CMS, publishing, public, build-budget and browser-secret test passes.

- **[DO NOT DO YET]** Do not run any production DNS command.

## Step 1 — Create the Supabase staging project

- **[FREE]** In a personal Supabase organization, create one Free project named `subtext-staging`.
- **[FREE]** Select the closest available region appropriate for staging.
- **[FREE]** Generate and securely store the database password.
- **[FREE]** Record privately:
  - project reference;
  - project URL;
  - publishable key name/value;
  - confirmation that `SUPABASE_SECRET_KEYS` appears under Edge Functions default secrets.
- **[DO NOT DO YET]** Do not create tables, policies, buckets, hooks or seed rows manually in the Dashboard.

## Step 2 — Link the repository and apply migrations

- **[FREE]** Authenticate the Supabase CLI on the founder’s machine:

```text
npx supabase login
```

- **[FREE]** Link staging:

```text
npx supabase link --project-ref <STAGING_PROJECT_REF>
```

- **[FREE]** Review pending changes first:

```text
npx supabase db push --linked --include-all --include-seed --dry-run
```

- **[FREE]** Apply migrations and the minimal idempotent seed:

```text
npx supabase db push --linked --include-all --include-seed
```

This creates all tables, enums, RLS, safe views, Storage buckets, atomic CMS commands and publishing-worker commands. The seed adds only pillars, categories and brand settings.

- **[FREE]** Verify:

```text
npx supabase migration list --linked
npx supabase gen types typescript --linked > /tmp/subtext-staging-types.ts
npm run db:check-generated
```

Do not replace the committed generated types with the temporary comparison file unless a reviewed schema mismatch is found.

## Step 3 — Generate independent staging secrets

- **[FREE]** Generate separate random values locally. Do not reuse any value across rows.
- **[FREE]** Required custom secrets:
  - `BEFORE_USER_CREATED_HOOK_SECRET` in `v1,whsec_<base64>` format;
  - `CUSTOM_ACCESS_TOKEN_HOOK_SECRET` in `v1,whsec_<base64>` format;
  - `PUBLISHING_WORKER_SECRET`, at least 32 random bytes encoded safely;
  - `REVALIDATION_SECRET`, different from the worker secret;
  - `CRON_SECRET`, different from every other secret.

Example generation pattern—capture output directly into a password manager, not shell history or Git:

```text
openssl rand -base64 32
```

Prefix the two Auth-hook base64 values with `v1,whsec_`.

- **[DO NOT DO YET]** Do not put these values into `.env.example` or any committed file.

## Step 4 — Create the GitHub OAuth staging App

- **[FREE]** Open GitHub **Settings → Developer settings → OAuth Apps → New OAuth App**.
- **[FREE]** Set the application name to the founder-operated staging application.
- **[FREE]** Set the homepage URL to the stable Admin Vercel URL:

```text
https://subtext-admin-staging.vercel.app
```

Use the actual stable Admin Vercel URL if the suggested name was unavailable.

- **[FREE]** Set the authorization callback URL—this is the Supabase callback, not the Admin callback:

```text
https://<STAGING_PROJECT_REF>.supabase.co/auth/v1/callback
```

- **[FREE]** Store the GitHub client ID and client secret privately.
- **[DO NOT DO YET]** Do not add `admin.subtext.media` to the GitHub OAuth App.
- **[DO NOT DO YET]** Do not request unrelated GitHub API scopes. The configured flow needs only `read:user user:email`.

## Step 5 — Deploy the two Auth-hook functions

- **[FREE]** Create a temporary local secrets file outside the repository or use direct CLI prompts. It must contain:
  - `FOUNDER_EMAIL`;
  - `BEFORE_USER_CREATED_HOOK_SECRET`;
  - `CUSTOM_ACCESS_TOKEN_HOOK_SECRET`.

- **[FREE]** Set only those custom secrets:

```text
npx supabase secrets set --project-ref <STAGING_PROJECT_REF> --env-file <SECURE_AUTH_SECRETS_FILE>
```

- **[FREE]** Deploy:

```text
npx supabase functions deploy before-user-created --project-ref <STAGING_PROJECT_REF> --no-verify-jwt
npx supabase functions deploy custom-access-token --project-ref <STAGING_PROJECT_REF> --no-verify-jwt
```

JWT verification is intentionally disabled because these hooks run before a user token exists. Standard Webhooks signatures are verified inside each function.

- **[FREE]** Verify the functions exist in Supabase. Do not invoke them with an unsigned payload and interpret rejection as a failure; unsigned requests must return 401.

## Step 6 — Create the Vercel Public staging project

- **[FREE]** Import the private GitHub repository into Vercel.
- **[FREE]** Create project `subtext-public-staging`.
- **[FREE]** Set Root Directory to:

```text
apps/public
```

- **[FREE]** Ensure **Include source files outside of the Root Directory** is enabled so workspace packages and the root lockfile are available.
- **[FREE]** Framework preset: Next.js.
- **[FREE]** Node runtime: project `engines` selects Node 22.
- **[FREE]** Configure Production environment variables for this staging project:

| Variable                               | Value source                          |
| -------------------------------------- | ------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`                 | Stable Public `.vercel.app` URL       |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase staging project URL          |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase staging publishable key      |
| `REVALIDATION_SECRET`                  | Generated staging revalidation secret |
| `PUBLISHING_WORKER_SECRET`             | Generated staging worker secret       |
| `CRON_SECRET`                          | Generated staging Cron secret         |

- **[FREE]** Deploy to the project’s Production target. In this guide “Production target” means the stable staging project alias, not the `subtext.media` domain.
- **[FREE]** Confirm the stable URL serves the Subtext homepage and `/robots.txt`.
- **[DO NOT DO YET]** Do not attach `subtext.media`.

## Step 7 — Create the Vercel Admin staging project

- **[FREE]** Import the same GitHub repository as a second Vercel project.
- **[FREE]** Create project `subtext-admin-staging`.
- **[FREE]** Set Root Directory to:

```text
apps/admin
```

- **[FREE]** Enable source files outside the Root Directory.
- **[FREE]** Configure Production environment variables:

| Variable                               | Value source                                  |
| -------------------------------------- | --------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`                 | Stable Public staging `.vercel.app` URL       |
| `NEXT_PUBLIC_ADMIN_URL`                | Stable Admin staging `.vercel.app` URL        |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase staging project URL                  |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase staging publishable key              |
| `SUPABASE_SECRET_KEY`                  | Supabase staging secret key; server-only      |
| `FOUNDER_EMAIL`                        | Exact founder GitHub email; server-only       |
| `PUBLISHING_WORKER_SECRET`             | Same staging worker secret used by the worker |

Configure `SUPABASE_SECRET_KEY` only as a server-only Vercel Admin variable. The CMS normally uses the founder JWT and RLS; the explicit privileged-client gateway must remain the only path for any RLS-bypassing operation. Keep the value out of browser variables and logs.

- **[FREE]** Deploy to the stable staging project alias.
- **[FREE]** Confirm `/admin` redirects to `/login`, `/api/admin/session` returns 401 without a session, and `/robots.txt` disallows all.
- **[DO NOT DO YET]** Do not attach `admin.subtext.media`.

## Step 8 — Deploy and configure the Publishing Worker

- **[FREE]** Create a secure Function secrets file containing only:
  - `PUBLISHING_WORKER_SECRET`;
  - `PUBLICATION_API_URL` set to the stable Public staging `.vercel.app` URL;
  - `REVALIDATION_SECRET`.

- **[FREE]** Push the custom secrets:

```text
npx supabase secrets set --project-ref <STAGING_PROJECT_REF> --env-file <SECURE_WORKER_SECRETS_FILE>
```

- **[FREE]** Do not attempt to set reserved `SUPABASE_*` custom secrets. Hosted Supabase injects `SUPABASE_URL` and `SUPABASE_SECRET_KEYS`; confirm both appear in the Edge Function environment. The worker reads `SUPABASE_SECRET_KEYS.default`. The singular `SUPABASE_SECRET_KEY` is only a local CLI fallback.

- **[FREE]** Deploy:

```text
npx supabase functions deploy publishing-worker --project-ref <STAGING_PROJECT_REF> --no-verify-jwt
```

- **[FREE]** An unsigned invocation must return 403.
- **[FREE]** Normal CMS publication triggers immediate worker dispatch.
- **[FREE]** The Vercel Hobby recovery Cron is intentionally daily (`0 3 * * *`). More frequent Cron expressions fail Hobby deployment.
- **[FREE]** During staging, a founder may manually re-invoke the worker after a retry backoff using the private worker secret from a secure terminal. Do not paste the command/output containing headers into chat.
- **[REQUIRES PAID PLAN]** Change recovery Cron to every ten minutes only after moving the Public project to Vercel Pro or another scheduler that permits that frequency.

## Step 9 — Apply Supabase Auth provider and hook configuration

Run this only after the stable Admin staging URL, GitHub OAuth App and deployed hooks exist.

- **[FREE]** In a secure terminal session, provide the committed configuration script with:
  - `SUPABASE_PROJECT_REF`;
  - `SUPABASE_ACCESS_TOKEN`;
  - `NEXT_PUBLIC_ADMIN_URL` set to the stable Admin staging URL;
  - `NEXT_PUBLIC_SUPABASE_URL`;
  - GitHub client ID and secret;
  - both Auth-hook secrets.

- **[FREE]** Validate without applying:

```text
npm run auth:configure
```

- **[FREE]** Apply:

```text
npm run auth:configure -- --apply
```

This enables only GitHub, disables email/phone/anonymous login, sets the exact callback allowlist and configures both signed HTTP hooks.

- **[FREE]** Verify in Supabase Auth settings:
  - Site URL is the stable Admin staging URL;
  - allowed redirect is `<ADMIN_STAGING_URL>/auth/callback`;
  - GitHub is enabled;
  - email, phone and anonymous login are disabled;
  - other OAuth providers remain disabled;
  - both HTTP hooks are enabled with the correct Function URLs.

## Step 10 — Redeploy both Vercel projects once

- **[FREE]** Trigger one clean redeployment of Public and Admin after all environment variables are saved.
- **[FREE]** Run the repository’s deployed-build checks locally against the same commit:

```text
npm run check
```

- **[FREE]** Confirm the Public deployment did not fail on Cron configuration. Hobby accepts the committed once-daily expression.

---

# D. Staging validation checklist

## Step 11 — Validate configuration without revealing it

- **[FREE]** Run target checks from the secure environment that holds each target’s variables:

```text
npm run launch:env -- --target=public
npm run launch:env -- --target=admin
npm run launch:env -- --target=operator
```

For Supabase Functions, verify provider-managed `SUPABASE_URL` and `SUPABASE_SECRET_KEYS` in the Supabase Function environment, then validate the custom values separately using the checklist. Do not export platform secret-key JSON merely to satisfy a local script.

- **[FREE]** Run a browser bundle scan on the built commit:

```text
npm run build
npm run auth:verify-bundles
npm run launch:build-audit
```

## Step 12 — Test founder and unauthorized login

- **[FREE]** Open the stable Admin staging URL in a private browser window.
- **[FREE]** Confirm `/admin` redirects to Login.
- **[FREE]** Sign in with the exact founder GitHub account.
- **[FREE]** Confirm the Writer Workspace opens.
- **[FREE]** Sign out and confirm direct Admin/API access is rejected.
- **[FREE]** In another private browser profile, try a different GitHub account.
- **[FREE]** Confirm Access Denied and no CMS/API data.
- **[FREE]** Confirm Supabase Auth did not create an unauthorized user row.

Do not capture access tokens, cookies or the founder email in screenshots.

## Step 13 — Create the real validation article through CMS

- **[FREE]** Use `docs/launch/launch-validation-story.md` as the acceptance content pack.
- **[FREE]** Use only the actual CMS:
  1. New Story.
  2. Enter title and excerpt.
  3. Select History and Archaeology.
  4. Add tags.
  5. Paste/edit canonical Markdown.
  6. Upload a founder-owned, public-domain or licensed cover image through Media.
  7. Upload a second rights-cleared inline image.
  8. Enter alt text, caption, credit and rights.
  9. Create the source through Sources.
  10. Attach the source and insert its citation.
  11. Enter SEO title and description.
  12. Review live preview, `:::subtext`, table, quote, footnote, images and Sources.
  13. Wait for **Saved**.

- **[DO NOT DO YET]** Do not insert the article through SQL, Supabase Studio, seed files or scripts.
- **[DO NOT DO YET]** Do not use generated or unlicensed imagery.

## Step 14 — Publish revision A

- **[FREE]** Click Publish once.
- **[FREE]** Confirm the UI reports a queued request rather than a deployment.
- **[FREE]** In Supabase logs/read-only tables, verify:
  - one job created;
  - one worker claim;
  - validation passed;
  - database committed;
  - verification started;
  - cache/search verification events;
  - job succeeded.
- **[FREE]** Record only non-secret job/revision IDs and timestamps in the E2E report.

## Step 15 — Validate the deployed public article

Set non-secret local variables to the actual staging paths, then run:

```text
PUBLIC_URL=https://subtext-public-staging.vercel.app \
TEST_ARTICLE_PATH=/history/<CURRENT-SLUG> \
TEST_OLD_ARTICLE_PATH=/history/<OLD-SLUG> \
TEST_SEARCH_QUERY=<DISTINCTIVE-TITLE-WORDS> \
npm run launch:production
```

Before the slug has changed, use Step 16 to create the old path, then run the complete validator.

Manually verify:

- **[FREE]** Canonical article exactly matches revision A.
- **[FREE]** Cover/inline variants, dimensions, alt text, caption and credit.
- **[FREE]** Markdown, quote, table, footnote, citation, Sources and `:::subtext`.
- **[FREE]** Title, description, canonical, Open Graph, X/Twitter, Article and Breadcrumb JSON-LD.
- **[FREE]** Search, sitemap and RSS use the canonical staging URL.
- **[FREE]** No private note, original key, audit/job data, founder identity or secret in HTML/network responses.

## Step 16 — Create revision B and test the old slug

- **[FREE]** In the CMS, change one substantive paragraph and change the slug.
- **[FREE]** Wait for **Saved**; confirm a new immutable revision appears.
- **[FREE]** Publish revision B.
- **[FREE]** Verify:
  - new canonical URL returns 200;
  - old revision A remains preserved;
  - old slug returns 301 to the new canonical URL;
  - search, sitemap, RSS and metadata use the new URL/content.

## Step 17 — Roll back to revision A

- **[FREE]** Use the CMS History rollback control; do not edit either revision.
- **[FREE]** Verify the job succeeds.
- **[FREE]** Confirm:
  - public body/checksum matches A;
  - B remains in history;
  - search reflects A;
  - caches, sitemap and RSS remain canonical;
  - audit and publication events remain intact.

## Step 18 — Unpublish

- **[FREE]** Click Unpublish.
- **[FREE]** Wait for the job to succeed.
- **[FREE]** Run:

```text
PUBLIC_URL=<PUBLIC_STAGING_URL> \
TEST_ARTICLE_PATH=<CURRENT_CANONICAL_PATH> \
TEST_OLD_ARTICLE_PATH=<OLD_PATH> \
TEST_SEARCH_QUERY=<QUERY> \
npm run launch:production -- --expect-absent
```

Expected: article 404; absent from search, sitemap and RSS; all revisions/history preserved.

## Step 19 — Republish

- **[FREE]** Choose the intended final draft/revision and Publish again.
- **[FREE]** Run the published-mode validator again.
- **[FREE]** Confirm public restoration without duplicated jobs, articles or revisions.

## Step 20 — Safe staging failure tests

Perform only in staging and restore each value immediately.

### Dispatch failure

- **[FREE]** Temporarily make the Admin staging `PUBLISHING_WORKER_SECRET` differ from the worker secret and redeploy Admin.
- **[FREE]** Publish a new revision. The job must remain queued; it must not disappear or publish partially.
- **[FREE]** Restore the correct Admin secret and redeploy.
- **[FREE]** Securely invoke the worker once or wait for the daily recovery Cron.
- **[FREE]** Confirm the original job succeeds exactly once.

### Verification/network failure

- **[FREE]** Temporarily set the worker’s `PUBLICATION_API_URL` to a non-routable test URL.
- **[FREE]** Publish a new revision and confirm retry events/backoff—not silent success.
- **[FREE]** Restore the Public staging URL with `supabase secrets set`.
- **[FREE]** Reinvoke after `available_at`; confirm committed work resumes verification without duplicate promotion.

### Duplicate dispatch

- **[FREE]** Securely invoke the worker endpoint twice in quick succession.
- **[FREE]** Confirm one claim for a single queued job and idempotent terminal state.

- **[DO NOT DO YET]** Do not simulate failures by editing publication rows or revision pointers manually.

## Step 21 — Manual responsive and editorial review

- **[FREE]** Complete `docs/launch/manual-visual-review.md` on phone, tablet and desktop.
- **[FREE]** Review homepage, all pillars, article, search, About, 404, loading/error states, citations and footer.
- **[FREE]** Record browser/device and non-secret screenshots in the E2E report.
- **[FREE]** Run browser DevTools/Lighthouse against the Public staging URL and complete the performance checklist.

## Step 22 — Staging backup and shutdown posture

- **[FREE]** Export a logical staging backup after the successful lifecycle test:

```text
npx supabase db dump --linked --file <ENCRYPTED_LOCAL_BACKUP_PATH>
```

- **[FREE]** Keep founder-owned source images separately; Supabase is not their only copy.
- **[FREE]** Free projects may pause when inactive. Restore from the Dashboard when the next staging session begins.
- **[FREE]** Leave staging on `.vercel.app`; no DNS action is required.

---

# E. Optional paid production infrastructure

These are not required for zero-cost staging.

- **[REQUIRES PAID PLAN]** Vercel Pro before any commercial deployment under current Vercel terms.
- **[REQUIRES PAID PLAN]** Vercel Pro for recovery Cron more frequent than daily.
- **[REQUIRES PAID PLAN]** Supabase Pro for non-pausing production, managed daily backups and larger quotas.
- **[REQUIRES PAID PLAN]** Point-in-time recovery is a separate paid Supabase option and is not required for staging.
- **[PRODUCTION ONLY]** Error monitoring or paid uptime monitoring may be added later without changing editorial architecture.
- **[PRODUCTION ONLY]** Cloudflare Free DNS is optional; it does not require a paid plan, but nameserver migration is a production operation.

---

# F. Production domain cutover — do not execute yet

Every item in this section is **[PRODUCTION ONLY] [DO NOT DO YET]**.

1. Confirm legal/operational control of `subtext.media`.
2. Decide where the existing Shopify storefront will live after any future cutover. Do not destroy it.
3. Export all DNS records from the current Google Domains DNS service.
4. Identify and preserve every MX, SPF, DKIM, DMARC, verification and other TXT record exactly.
5. Upgrade hosting if required for commercial eligibility and production reliability.
6. Create/configure the separate Supabase production project; never reuse staging data as production by changing URLs in place.
7. Apply migrations, deploy functions and run the full CMS lifecycle on the production project before DNS.
8. Add `subtext.media` to the Vercel Public project and `admin.subtext.media` to the Vercel Admin project; collect the exact verification/A/CNAME records Vercel supplies.
9. Update GitHub OAuth, Supabase Site URL/allowlist, Vercel environment variables and worker coordinator URL to the final domains.
10. Lower only the relevant web-record TTL if authorized. Do not alter mail records.
11. Change only the apex/www web records required for Public and add only the Admin subdomain record.
12. Verify TLS, canonical metadata, redirects, robots, sitemap, RSS, Auth and worker before announcing cutover.
13. Run `npm run launch:domain-audit` and both production black-box modes.
14. Keep the prior Shopify web-record values documented for immediate rollback.
15. If validation fails, restore only the prior web A/CNAME values. Do not touch MX/TXT.

No step above is authorized by this guide alone. The founder must explicitly approve production cutover in a future operation.

---

# G. Final staging sign-off

Staging is activated only when all boxes are checked:

- [ ] Supabase Free project created and migrations/seed applied.
- [ ] Auth hooks deployed and signed.
- [ ] GitHub OAuth exact callback configured.
- [ ] Public stable `.vercel.app` URL deployed.
- [ ] Admin stable `.vercel.app` URL deployed.
- [ ] Publishing worker deployed with provider-managed secret-key dictionary present.
- [ ] Vercel Hobby daily Cron deployed successfully.
- [ ] Founder login succeeds and another GitHub account is rejected.
- [ ] Real article was created only through CMS with rights-cleared images and source.
- [ ] Publish A, publish B, rollback A, unpublish and republish all succeeded.
- [ ] Search, sitemap, RSS, canonical metadata and 301 redirect passed.
- [ ] Failure recovery and duplicate dispatch passed.
- [ ] Browser bundle, mobile/tablet/desktop, performance, SEO and private-data checks passed.
- [ ] Encrypted logical backup and original media copies exist.
- [ ] `subtext.media`, Shopify and all production DNS records remain unchanged.

After this checklist passes, staging is validated. It still does not authorize or perform production DNS cutover.
