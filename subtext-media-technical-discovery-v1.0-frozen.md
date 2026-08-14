# Subtext Media — Technical Discovery & Frozen Architecture

**Document status:** Architecture v1.0 — FROZEN; approved for implementation preparation  
**Freeze date:** 8 August 2026  
**Prepared for:** Founder, Subtext Media  
**Operating profile:** ZB-1 — ₹0 “Free tiers first, upgrade-ready”  
**Purpose:** Record the approved solo-founder architecture, its zero-budget production topology, operational constraints, upgrade triggers, and implementation gates.

---

## Executive conclusion

The product concept is coherent, but the proposed publishing sequence contains one major architectural mistake: **publishing editorial content should not deploy the application**.

A code deployment is a release-management event. An article publication is a data-state change. Coupling the two would make publishing slower and less reliable, turn a content correction into a production deployment, and create unnecessary dependency on build minutes, Git state, deployment webhooks, and hosting availability.

The recommended model is:

- **One private repository and one monorepo**, optimized for one founder.
- **Three separately deployable/runtime-isolated modules**:
  1. Public reader application.
  2. Private writer application.
  3. Idempotent background publishing worker.
- **One shared Supabase platform** for Postgres, Auth, and Storage, with strict Row Level Security and clearly separated public/private data paths.
- **Database-backed publishing with cache invalidation**, not a static-site rebuild on every article.
- **Markdown as portable editorial source**, provided that the block set is deliberately constrained and raw executable MDX/HTML is prohibited.
- **Images processed before publication**, preferably at upload time. Publish verifies image readiness instead of doing CPU-heavy image work in the critical path.
- **An immutable revision is the unit of publication**. Drafts can keep changing without changing the live article until another revision is deliberately published.
- **No AI dependency of any kind**. Slugs, reading time, metadata defaults, search, validation, and recommendations are deterministic.
- **₹0 launch infrastructure**. The architecture uses only eligible free tiers at launch and preserves clean in-place upgrade paths.

This will be built as a **modular monolith**, not as a microservice system. Runtime boundaries matter; repository proliferation, duplicated frameworks, and distributed infrastructure do not help a solo founder.

### Frozen architecture decisions

| Area | Frozen decision | Status |
|---|---|---|
| Application framework | TypeScript and Next.js App Router for both public and admin applications | Frozen |
| Data/Auth/Storage | Supabase Postgres, Auth, Storage, and database-backed queue | Frozen |
| Publishing orchestration | Transactional publication job + durable queue + retryable worker | Frozen |
| Content source | CommonMark/GFM-style Markdown plus a small, versioned directive set | Frozen; editor round-trip remains an implementation acceptance test |
| Search | PostgreSQL full-text search plus typo/proper-name fallback | Frozen for v1 |
| Rendering | Server-rendered/cached public pages with targeted on-demand invalidation | Frozen |
| Hosting | GitHub Free + Vercel Hobby where terms permit + Supabase Free + Cloudflare Free DNS/DNSSEC + Google OAuth | Frozen under profile ZB-1 |
| Media | Pre-generated fixed image variants stored in Supabase; no paid/on-demand image transformation dependency | Frozen for v1 |
| Analytics | No required client analytics at launch; operational counters/logs only | Frozen for v1 |
| AI | None in the core system; future integrations only behind optional adapters | Frozen |

### Freeze condition: architecture versus service level

The zero-budget profile preserves the **software architecture**, data model, security boundaries, and upgrade path. It cannot provide the same availability, support, backup retention, or quota headroom as paid production plans. That is an accepted launch-stage operational constraint, not an architectural redesign.

One terms-of-service gate is mandatory: Vercel states that Hobby deployments are restricted to non-commercial personal use. Subtext may use Hobby only while its deployment qualifies under those terms. Advertising, subscriptions, sales, or another commercial purpose triggers a Vercel plan upgrade before that use goes live; upgrading the existing Vercel projects changes billing/configuration, not application code. [1](https://vercel.com/docs/plans/hobby) · [4](https://vercel.com/docs/limits/fair-use-guidelines)

---

# 1. Product Architecture

## 1.1 What Subtext is technically

Subtext is a **single-tenant editorial publishing product** with one trusted operator and a public read-only audience. It is not a multi-tenant SaaS CMS, social network, newsroom workflow system, or generic page builder. That greatly reduces required complexity.

The platform still needs newsroom-grade properties in a few places because it publishes research-driven work:

- revision history;
- citations and source provenance;
- media rights and credits;
- preview and fact-check gates;
- deterministic publication;
- redirects and correction history;
- auditability and recovery.

## 1.2 Recommended boundaries

### Public reader application — `subtext.media`

Responsibilities:

- render only published revisions;
- render home, pillar/category, article, search, author, policy, and static pages;
- serve SEO metadata, structured data, sitemap, robots, feeds, and social cards;
- expose no draft or admin functionality;
- remain usable if the admin application or publishing worker is unavailable;
- contain as little browser JavaScript as possible.

### Private writer application — `admin.subtext.media`

Responsibilities:

- authenticate the founder;
- create and edit drafts;
- manage sources, citations, assets, taxonomy, SEO fields, previews, and site curation;
- autosave with revision/concurrency protection;
- request publication, scheduling, rollback, or unpublication;
- display publishing job progress and actionable errors;
- never contain a service-role database credential in browser code.

### Publishing worker

Responsibilities:

- consume durable publication jobs;
- validate the exact requested revision;
- prepare deterministic derived data;
- atomically promote that immutable revision to “published”;
- invalidate the smallest relevant public caches;
- verify the canonical public URL and metadata;
- retry transient failures without duplicating side effects;
- record a complete job/event log.

It should not be a permanently running custom server unless scale later demands it. A queue-triggered managed function is sufficient for initial scale, but image transformation should not depend on short CPU-limited edge execution. Supabase documents queues and retry-oriented Edge Function consumption, while also documenting strict Edge Function CPU and duration limits; this supports using Edge Functions for orchestration, not heavy image encoding. [5](https://supabase.com/docs/guides/queues/consuming-messages-with-edge-functions) · [2](https://supabase.com/docs/guides/functions/limits)

## 1.3 Independence without microservice overhead

“Independent modules” should mean:

- distinct deployment targets;
- distinct domains and security policies;
- no admin code shipped to public readers;
- queue-based worker isolation;
- public site failure does not corrupt drafts;
- worker failure does not erase or partially publish content.

It should **not** mean three repositories, three languages, three design systems, or three databases. A monorepo with shared schemas, validation, content parsing, and UI foundations is safer for one maintainer.

## 1.4 Recommended data flow

1. The founder edits a mutable draft.
2. Autosave writes draft state and creates recoverable checkpoints.
3. “Publish” runs fast preflight validation and asks for confirmation if warnings remain.
4. One database transaction freezes the target revision and creates a publication job.
5. The worker performs final validation and prepares derived values.
6. One atomic database transaction changes the article’s published revision pointer and publication state.
7. Targeted caches are invalidated for the article, home page, affected taxonomy pages, feeds, and sitemap.
8. The worker requests the canonical URL until the expected revision marker and metadata are observed.
9. The admin UI reports **Live**, **Live—verification delayed**, or **Failed before publication**, rather than presenting a generic success message.

## 1.5 Product principles to lock

- The public URL never reads mutable draft content.
- A draft is never made public by changing a client-side flag alone.
- Publish is idempotent: retrying the same job has the same final result.
- The last verified live revision remains available during failures.
- A correction is another revision, not an in-place untracked edit.
- Published media should be treated as potentially permanent on the public internet even after unpublication.
- AI may later assist the founder, but no stored content, publication state, or reader request depends on it.

---

# 2. Frontend

## 2.1 Public experience

The public experience should be designed as an editorial reading product, not a generic card-grid blog. Recommended foundation:

- server-rendered semantic HTML;
- restrained, typography-led visual system;
- article-first mobile layout;
- optional reading progress and table of contents only when they improve long-form navigation;
- footnotes, source notes, pull quotes, figures, captions, and credits as first-class elements;
- related reading based on editorial tags/taxonomy, not AI;
- print stylesheet and clean link sharing;
- no infinite scroll on article pages;
- no autoplay media;
- no intrusive pop-ups;
- graceful use without JavaScript for all primary reading paths.

### Core public routes

The minimum expected route set is:

- Home
- Pillar landing pages: History, Business, Psychology, Society
- Optional subcategory landing pages
- Article detail
- Search and search results
- Author/founder page
- About
- Editorial standards/methodology
- Corrections policy
- Contact
- Privacy policy and terms/copyright
- Custom 404 and error states
- RSS/Atom feed endpoint, if approved

## 2.2 Admin experience

The writer workspace should be **desktop-first but safely usable on tablet**, unless full mobile authoring is explicitly required. Its information architecture should be deliberately small:

- Articles
- New article
- Media library
- Sources/research, if separate from articles
- Taxonomy
- Homepage/featured curation
- Settings
- Publishing jobs/history

### Editor behavior

Recommended capabilities:

- title, dek, body, taxonomy, hero, author, SEO, and publication settings separated cleanly;
- distraction-free body mode;
- keyboard shortcuts and slash commands;
- Markdown shortcuts while typing;
- autosave state visible as Saving / Saved / Error;
- local crash recovery for unsent changes;
- preview at real public breakpoints;
- revision history with compare and restore;
- optimistic concurrency to stop a second tab overwriting a newer draft;
- command palette for navigation and actions;
- explicit publish review panel;
- no dashboard vanity metrics unless they are genuinely useful.

## 2.3 Framework decision

For a solo founder, using one framework for public and admin applications is more valuable than selecting a marginally faster second framework for the public site. The frozen decision is a current stable Next.js App Router release with TypeScript, because it supports server rendering, metadata routes, selective caching, and on-demand invalidation in one ecosystem.

Next.js supports tag/path-based revalidation, which is the correct primitive after a CMS mutation; the documentation explicitly recommends webhook/notification-driven cache invalidation for CMS content rather than rebuilding unchanged pages. [3](https://nextjs.org/docs/app/getting-started/revalidating)

Framework-specific calls remain behind the web application’s cache-invalidation boundary. A same-provider Vercel plan upgrade needs no framework change.

## 2.4 Design-system requirements

Before component implementation, define:

- wordmark/logo assets and usage rules;
- editorial serif/sans/mono font roles and font licences;
- type scale, line lengths, spacing, color tokens, focus states, and motion rules;
- image aspect ratios for home/category/social contexts;
- dark mode policy;
- illustration/photography treatment;
- accessibility target (recommended WCAG 2.2 AA);
- allowed editorial blocks and all their responsive states.

Self-host font files where licensing permits. Do not depend on third-party font requests at runtime.

---

# 3. Backend

## 3.1 Recommended backend shape

Use Supabase as the managed backend platform, with a thin application backend/BFF in each web app and a separate publishing worker.

- Browser-to-database access in admin is allowed only through RLS-protected, least-privilege operations.
- Security-sensitive commands such as publish, rollback, asset promotion, or site settings changes go through server-controlled commands/RPCs.
- The public application should query a deliberately constrained published-content interface, not general article tables.
- The service-role secret is limited to server/worker environments and never exposed to either browser bundle.

## 3.2 Domain services

Keep domain logic in shared modules with clear boundaries:

- Content and revision service
- Taxonomy service
- Media service
- Publication service
- Search service
- Redirect service
- SEO/metadata service
- Site curation service
- Audit service

This is a modular monolith: domain boundaries exist in the code and schema, but they do not require a network hop.

## 3.3 API rules

- Validate every command on the server, even if the client already validated it.
- Use one authoritative schema for form, database-command, and worker validation.
- Mutations require authenticated founder authorization and CSRF-safe request handling.
- Public query endpoints are read-only, rate-limited where abuse is plausible, and return only published fields.
- Publication commands accept an idempotency key.
- Long operations return a job identifier rather than keeping the browser request open.
- Errors use stable machine codes plus founder-readable remediation.

## 3.4 Observability

Minimum operational visibility:

- structured application and worker logs;
- publication job timeline;
- deployment and migration history;
- error alerting;
- uptime check of home page and a known article;
- failed queue/dead-letter visibility;
- database/storage quota alerts;
- weekly backup-success notification;
- no reader personal data in logs beyond what is operationally necessary.

---

# 4. Database

## 4.1 Core model

The database should model a publication, not merely a `posts` table.

### Required entities

| Entity | Purpose |
|---|---|
| `articles` | Stable identity, lifecycle state, canonical slug reference, taxonomy, current and published revision pointers |
| `article_revisions` | Immutable or checkpointed title, dek, body Markdown, SEO fields, and editorial metadata |
| `authors` | Public byline and structured author identity, even if there is initially one author |
| `pillars` / `categories` | Controlled top-level taxonomy |
| `subcategories` | Controlled second-level taxonomy, if retained |
| `tags` and article-tag relationships | Cross-pillar discovery without changing primary URLs |
| `sources` / `citations` | Research provenance, footnotes, bibliography data, access dates, notes, and public/private visibility |
| `media_assets` | Original upload, ownership/rights, alt text, caption, credit, dimensions, focal point, processing state |
| `media_variants` | Responsive derivatives and format metadata |
| `article_media` | Usage role and ordering within a revision |
| `slug_history` / `redirects` | Permanent redirects after URL changes |
| `publication_jobs` | Durable publication state, attempt count, target revision, timestamps, and error summary |
| `publication_events` | Step-level audit trail and verification results |
| `site_settings` | Small controlled set of global publication data |
| `featured_slots` or `collections` | Explicit homepage/series curation if approved |
| `audit_log` | Sensitive admin actions and before/after identifiers |

## 4.2 Revision model

Recommended behavior:

- The article has a stable UUID for life.
- The article points to one mutable/current draft and one immutable published revision.
- Publishing freezes a snapshot; subsequent autosaves create or update a newer draft without affecting readers.
- Rollback republishes a prior revision through the same publishing engine.
- Revision retention is long-lived; accidental deletion has a recovery window.
- Every save carries a revision/version number to prevent lost updates between tabs.

## 4.3 Publication state

Use explicit states rather than one Boolean:

- Draft
- In review / ready (optional for a solo workflow)
- Scheduled (if approved)
- Publishing
- Published—verification pending
- Published—verified
- Publication failed before commit
- Archived/unpublished

Job state and article state must be separate. A failed cache verification does not mean the database transaction necessarily failed.

## 4.4 Constraints and indexes

The schema should enforce, not merely suggest:

- unique normalized slugs among active canonical URLs;
- one primary pillar/category per article, unless the founder explicitly wants multiple;
- valid state transitions;
- no published revision without required title/body/byline/taxonomy;
- referential integrity for media and citations;
- publication dates stored in UTC;
- indexes for publication date, taxonomy, slug, status, search vector, and job polling;
- public query surfaces that exclude drafts at the database level.

## 4.5 Search

Initial search should use PostgreSQL:

- weighted full-text index: title > dek > headings/tags > body;
- English stemming only if publication language is English;
- trigram/exact fallback for names, transliterations, brands, dynasties, and archaeological terms;
- filters for pillar and publication year only if reader research shows value;
- snippets generated from published text only.

An external engine such as Meilisearch or Algolia is not justified initially. Define migration thresholds instead: sustained slow queries, substantially larger corpus, multilingual requirements, advanced typo tolerance, or faceted discovery needs.

## 4.6 Backups and recovery — zero-budget profile

Supabase recommends that Free projects regularly export data using the CLI because downloadable managed backups are not available to Free projects. Storage objects are not covered by database backups. [3](https://supabase.com/docs/guides/platform/backups) · [1](https://supabase.com/docs/guides/deployment/going-into-prod)

The frozen free-tier strategy is:

- run a nightly logical Postgres dump from GitHub Actions;
- encrypt the dump before artifact upload and keep the encryption key outside GitHub;
- retain a rolling set within GitHub Free artifact limits;
- export a Storage inventory with each database backup;
- retain founder-controlled master copies of all original/licensed media outside the application; Supabase is not the only copy of source media;
- treat public derivatives as reproducible from the master asset plus stored crop/focal metadata;
- download a weekly encrypted backup to founder-controlled local storage;
- perform a quarterly restore test into staging;
- alert before backup artifacts approach the GitHub Free storage quota;
- preserve an RPO target of 24 hours and an initial RTO target of one business day.

GitHub Free currently includes 2,000 Actions minutes per month and 500 MB of artifact storage for private repositories. Workflows must use path filters, caching, short artifact retention, and compressed dumps to remain inside this allowance. [1](https://docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions)

When Supabase is upgraded, managed daily backups/PITR can be enabled on the existing project without a schema or data migration. The independent logical export remains as defense in depth.

---

# 5. CMS

## 5.1 The central content-format decision

“Notion-like” and “Markdown-based” can conflict.

- Notion-style editors naturally store a structured block tree.
- Markdown is portable and durable but cannot losslessly represent every arbitrary block.
- Maintaining both block JSON and Markdown as equal sources of truth creates synchronization failures.

### Recommendation

Use **Markdown as the single canonical body format**, with:

- CommonMark/GFM-compatible core syntax;
- front matter kept out of the body and stored in typed database columns;
- a very small, versioned directive syntax for approved rich blocks;
- Markdown import/export;
- a WYSIWYM editor that feels block-oriented but never claims to support arbitrary layout;
- one parser and renderer shared by preview, validation, search extraction, and the public site;
- no raw JavaScript and no MDX execution;
- raw HTML disabled or strictly sanitized.

Before building the full CMS, create a throwaway editor spike and prove lossless round-tripping for every approved block. This is the highest-risk implementation decision.

## 5.2 Proposed initial block set

Recommended minimum:

- paragraphs and headings;
- emphasis, strong, links, inline code;
- ordered/unordered lists;
- block quotes and pull quotes;
- figures with image, alt, caption, credit, and optional source;
- footnotes/citations;
- horizontal thematic break;
- data table with accessible headers;
- callout/note;
- embedded video from a strict allowlist and privacy-enhanced URL mode;
- optional gallery only if real launch stories need it.

Timelines, maps, charts, comparison cards, audio, document viewers, and arbitrary embeds should not enter v1 without concrete content examples.

## 5.3 Research workflow

The current brief omits the strongest differentiator of a research publication. The CMS should decide whether to support:

- private research notes;
- structured source records;
- public footnotes/endnotes;
- source URL, publisher, author, publication date, access date, archive URL, and page number;
- fact-check status/checklist;
- quote attribution;
- media rights evidence;
- correction notes after publication.

At minimum, sources/citations and media provenance should be first-class rather than pasted into unstructured text.

## 5.4 Content validation

Hard blockers should be few and objective:

- title, body, primary pillar, author, slug;
- hero image if the selected template requires it;
- alt text for informative images;
- credit/rights fields for non-original media;
- valid internal references;
- no unprocessed or failed media asset;
- no duplicate canonical slug.

Warnings, not blockers:

- title/description length guidance;
- missing social override;
- long paragraphs;
- unresolved private notes;
- citation completeness;
- broken external links, because remote sites can fail transiently;
- missing related stories.

## 5.5 Media library

Every asset needs:

- original filename and checksum;
- MIME validation based on file content, not extension;
- dimensions, orientation, file size;
- alt text distinct from caption;
- creator/credit;
- source URL;
- licence/rights status and restrictions;
- focal point for responsive crops;
- private original and optimized public derivatives;
- article/revision usage references;
- duplicate detection;
- processing status and error.

Images should normally be processed at upload time. Publish should only confirm that required variants exist. This keeps the one-click publish path fast and predictable.

Under ZB-1, Supabase’s managed image transformations are not used because that feature is unavailable on the Free plan. The application creates a small fixed derivative set before publication, stores provider-neutral dimensions/format/object keys in `media_variants`, and serves immutable files through the media delivery boundary. [2](https://supabase.com/docs/guides/platform/org-based-billing)

The public application must not depend on Vercel’s on-demand image transformer for editorial media. Vercel Hobby currently caps transformations and can return errors after the allowance is exhausted. Pre-generated variants prevent a quota event from removing article imagery and also make a future Vercel plan upgrade a configuration-only change. [9](https://vercel.com/docs/image-optimization/limits-and-pricing)

---

# 6. Authentication

## 6.1 Required flow

1. Founder visits `admin.subtext.media`.
2. The application offers only “Continue with Google.”
3. Supabase Auth completes Google OAuth.
4. A server-side exact-email allowlist check is applied.
5. The founder receives the administrator authorization claim/session.
6. Every protected route and every database policy independently verifies authorization.
7. All other identities receive a generic 403 and are signed out.

## 6.2 Stronger recommendation than post-login checking

Use Supabase’s **Before User Created hook** to reject creation for any email except the exact founder allowlist, rather than allowing stray `auth.users` rows and merely hiding the UI. Supabase documents this hook specifically for rejecting unwanted signups and lists it for Free and Pro plans. [2](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook) · [1](https://supabase.com/docs/guides/auth/auth-hooks)

Then use either:

- a custom access-token hook that adds an immutable `admin` claim; or
- a private database authorization function that checks the authenticated user ID against a one-row administrator table.

The immutable Supabase user UUID should become the primary administrator identity after bootstrap. Email remains the admission rule but should not be the only long-term authorization identifier.

## 6.3 Defense in depth

- Google is the only enabled identity provider.
- No email/password, magic link, anonymous, or phone login.
- Exact OAuth callback URLs are allowlisted for production and staging.
- Admin routes are protected server-side, not only through a client redirect.
- RLS is enabled on every exposed table and Storage object policy.
- Authorization never relies on user-editable metadata. Supabase explicitly warns that `user_metadata` is user-editable and unsuitable for security-sensitive RLS; app metadata or server-side lookups are appropriate. [5](https://supabase.com/docs/guides/database/postgres/row-level-security)
- Session cookies use Secure, HttpOnly where applicable, and appropriate SameSite settings.
- Admin responses set `noindex, nofollow` and are excluded from sitemap.
- Rate limits apply to OAuth starts/callback abuse and sensitive commands.
- Founder Google account should use a passkey/security key and recovery codes.
- Optional second gate such as Cloudflare Access is not recommended initially unless the threat model requires it; duplicate identity layers increase recovery complexity.

## 6.4 Recovery requirement

A one-admin system can be completely locked out. Before launch, document:

- what happens if the founder email changes;
- Google account recovery;
- Supabase organization owner recovery;
- emergency allowlist update procedure;
- secret rotation;
- how to revoke all active sessions after suspected compromise.

---

# 7. Publishing Engine

## 7.1 Revised one-click workflow

The requested workflow should be changed to:

**Before Publish (continuous or upload-time)**  
Autosave → Generate/lock draft slug → Compute reading-time preview → Process images → Validate draft → Generate deterministic metadata defaults → Preview

**On Publish**  
Preflight → Freeze revision → Enqueue job → Final validate → Prepare derived data → Atomically promote revision → Update search projection → Invalidate affected caches → Refresh sitemap/feed views → Verify canonical URL → Mark verified live

**Not included:** application deployment.

## 7.2 Why “Deploy” must be removed

Home, categories, search, and sitemap should be views of published data. Publishing should invalidate their cached representations. Modern on-demand revalidation is designed for this exact CMS pattern; it avoids full rebuilds and can invalidate tagged content selectively. [1](https://nextjs.org/docs/app/api-reference/functions/revalidateTag)

Application deployment occurs only when code, schema-compatible behavior, or design assets change.

## 7.3 Deterministic derived values

No AI is needed:

- **Slug:** normalized title-derived default, founder-editable, uniqueness enforced. Freeze after first publication unless intentionally changed with a permanent redirect.
- **Reading time:** word count divided by an approved words-per-minute constant, with rules for captions, footnotes, tables, and embeds documented.
- **Meta title:** explicit override, otherwise article title plus optional brand suffix.
- **Meta description:** explicit summary/dek fallback; never silently extract an arbitrary opening paragraph if quality matters.
- **Open Graph:** explicit override or template using hero image, title, pillar, and brand.
- **Structured data:** schema generated from typed article/author/media fields.
- **Search text/vector:** title, dek, headings, tags, citation/public body text with fixed weights.
- **Related content:** manually selected first, deterministic tag/taxonomy fallback second.

## 7.4 Job properties

Every job needs:

- immutable target revision ID;
- initiating administrator ID;
- idempotency key;
- status and current step;
- attempts, next retry, and lease/visibility timeout;
- structured errors;
- timestamps for each step;
- expected public URL and revision fingerprint;
- dead-letter state and manual retry action.

A transactional outbox pattern should ensure the publication request and queued work cannot diverge.

### Free-tier execution rule

The durable job record and queue live in Postgres/Supabase, not in a Vercel-only workflow product. A short Supabase Edge Function or authenticated Vercel function may consume jobs, but every step checkpoints in the database and can resume after a timeout. Heavy media encoding is excluded from this worker. This remains within Supabase Free function constraints and permits in-place plan upgrades without changing queue data or job state. Supabase currently documents a 150-second Free wall-clock cap, 256 MB memory, and a 2-second per-request CPU limit, so worker tasks must stay small and idempotent. [2](https://supabase.com/docs/guides/functions/limits)

## 7.5 Cache invalidation scope

A publication may affect:

- canonical article page;
- previous URL redirect, if slug changed;
- home page and paginated home archive;
- primary pillar and subcategory pages;
- tag pages, if public;
- author page;
- related-article blocks on specifically linked stories;
- search;
- sitemap and feed.

Invalidate by content/taxonomy tags where possible. Do not purge the entire site for every edit.

## 7.6 Verification

Verification should check:

- HTTP 200 at canonical URL;
- expected revision fingerprint in server-rendered output or a safe response header;
- canonical link;
- title and description;
- primary Open Graph image availability;
- absence of `noindex`;
- structured-data parse presence;
- cache freshness.

External search-engine indexing cannot be part of synchronous verification. “Live” means publicly retrievable from Subtext, not already indexed by Google.

## 7.7 Required reverse operations

V1 should define, even if some are deferred:

- update and republish;
- rollback to an earlier revision;
- unpublish/archive;
- schedule and cancel schedule;
- change slug with permanent redirect;
- delete draft;
- restore deleted draft;
- retry failed publish;
- emergency correction;
- media takedown.

---

# 8. SEO

## 8.1 Technical SEO baseline

- server-rendered indexable HTML;
- one canonical URL per article;
- stable URL policy and permanent redirect history;
- XML sitemap or sitemap index generated only from published canonical records;
- correct robots rules;
- RSS/Atom feed if approved;
- Open Graph and social metadata;
- semantic headings and landmarks;
- image dimensions, alt text, and descriptive filenames where practical;
- breadcrumb navigation and `BreadcrumbList` structured data;
- `Organization`, `WebSite`, `Person`, and `Article`-appropriate JSON-LD;
- consistent `datePublished` and meaningful `dateModified` policy;
- author, editorial standards, corrections, and about pages;
- Google Search Console and Bing Webmaster Tools setup;
- 404/410 and redirect monitoring;
- no indexing of previews, admin, drafts, internal search combinations, or staging.

## 8.2 Editorial SEO policy

Generated metadata should be a fallback, not a substitute for editorial judgment.

- Founder controls SEO title and description.
- Public dek may differ from search description.
- `datePublished` never changes on routine updates.
- `dateModified` changes only for a reader-meaningful revision, not every typographic save.
- Corrections can be disclosed visibly where material.
- Source citations should be crawlable when public.
- Do not create thin auto-generated tag pages; index only curated taxonomy pages with unique editorial value.
- Do not use `NewsArticle` merely because the platform is a publication; choose the schema type matching the actual content.

## 8.3 URL decision

A URL policy is still open. Recommended candidates:

1. `subtext.media/{pillar}/{slug}` — clear information scent, but recategorization changes the canonical path unless redirected.
2. `subtext.media/stories/{slug}` — stable across taxonomy changes, but less editorially expressive.
3. `subtext.media/{slug}` — shortest, but increases route/slug namespace conflicts.

Recommendation: **`/{pillar}/{slug}` with permanent slug/path history**, unless frequent cross-pillar recategorization is expected.

---

# 9. Security

## 9.1 Primary threats

- unauthorized access to the sole administrator account;
- accidental exposure of drafts through queries, previews, Storage URLs, or cache keys;
- service-role key leakage;
- XSS through Markdown, embeds, SVGs, or copied HTML;
- malicious file upload;
- forged publish or cache-invalidation requests;
- dependency/supply-chain compromise;
- deletion/ransomware without recoverable backups;
- denial of service against search or image routes;
- OAuth callback misconfiguration;
- public exposure of research notes, source annotations, or embargoed material.

## 9.2 Required controls

- RLS on every exposed table and Storage bucket.
- Public reads through a published-only view/RPC or equivalent database policy.
- Separate private originals/drafts from public optimized derivatives.
- Private preview URLs are short-lived, authenticated, and `noindex`.
- Uploaded SVG is rejected or sanitized and served with safe headers; raster formats are re-encoded.
- File type, dimensions, decompression size, and file size are limited.
- Markdown raw HTML is disabled or sanitized with a strict allowlist.
- Embed providers are allowlisted; no arbitrary iframe/script paste.
- Content Security Policy differs appropriately between public and admin apps.
- HSTS, frame restrictions, MIME sniffing protection, referrer policy, and permissions policy.
- Publish/revalidation webhooks use high-entropy secrets, signatures, timestamps, and replay protection.
- Service secrets are provider-managed and rotated.
- Dependency lockfile, automated update alerts, CI audit, and restricted GitHub access.
- Audit log for publish, unpublish, rollback, slug change, settings, auth/allowlist changes, and destructive media actions.
- Backup restoration is tested, not assumed.

## 9.3 Public media reality

Once a media file has been publicly served and cached, unpublication cannot guarantee erasure from third-party caches or archives. Rights clearance must therefore happen before initial publication. The CMS should communicate this clearly.

---

# 10. Performance

## 10.1 Public budgets

Recommended launch targets at the 75th percentile on mobile:

- LCP at or below 2.5 seconds;
- INP at or below 200 ms;
- CLS at or below 0.1;
- minimal route-specific browser JavaScript for article pages;
- no unbounded third-party scripts;
- responsive images with intrinsic dimensions;
- no layout shift from fonts, embeds, consent UI, or ads.

Set an explicit initial JavaScript and font budget during design; do not wait for the finished UI.

## 10.2 Rendering and caching

- Cache public article and taxonomy reads close to readers.
- Use long-lived cache semantics plus targeted invalidation after publication.
- Keep article body rendering server-side.
- Hydrate only interactive islands such as search, copy-link, or table-of-contents behavior.
- Avoid fetching Supabase independently from many nested components; use a coherent server data layer.
- Precompute search vectors and expensive content extraction on save/publish.
- Paginate archives and search.
- Index all common public query paths.

## 10.3 Images

- Preserve private original for future reprocessing.
- Generate a small fixed width set based on actual layout needs.
- Prefer AVIF/WebP with a compatible fallback where required.
- Strip unnecessary metadata while retaining rights metadata in the CMS.
- Store dimensions and dominant placeholder data.
- Use focal points rather than creating many manual crops.
- Never publish an original camera-size image directly into an article layout.

## 10.4 Third parties

Every analytics, video, social, comment, ad, and font script affects privacy and performance. V1 should contain none by default except a chosen analytics solution and explicit embed providers.

---

# 11. Deployment

## 11.1 Frozen production profile: ZB-1

Subtext launches with ₹0 recurring infrastructure cost using:

| Capability | Free-tier service | Use |
|---|---|---|
| Source control and CI | GitHub Free | Private monorepo, pull requests, dependency alerts, tests, migrations, nightly logical backup |
| Public/admin hosting | Vercel Hobby, while eligible under non-commercial terms | Two independent Next.js projects connected to the same monorepo |
| Database/Auth/Storage/queue | Supabase Free | Postgres, RLS, Google OAuth broker, private/public buckets, publication jobs and Edge Functions |
| DNS | Cloudflare Free | Authoritative DNS and DNSSEC; keep Vercel records DNS-only unless a proxied edge design is explicitly tested |
| Identity provider | Google OAuth | One exact-whitelisted founder identity with minimum `openid email profile` scopes |

No production feature depends on a trial period, credit grant, paid add-on, paid image transformation, paid LLM, or usage-based overage.

### Non-negotiable terms gate

Vercel Hobby is currently restricted to non-commercial personal use. Therefore:

- ZB-1 is valid only while Subtext’s Vercel deployments satisfy Vercel’s then-current Hobby terms.
- Before enabling advertising, paid subscriptions, product/service sales, affiliate-led monetization, or another commercial use, the founder must upgrade the existing Vercel account/projects or choose a legally eligible host.
- This is an account/plan change. The domains, repositories, environment contracts, applications, and database remain unchanged.
- If Subtext is legally commercial from the first public launch irrespective of current revenue, a ₹0 Vercel production launch is not compliant; architecture remains frozen, but Vercel Pro funding or an eligible hosting target is a launch prerequisite.

[1](https://vercel.com/docs/plans/hobby) · [4](https://vercel.com/docs/limits/fair-use-guidelines)

## 11.2 Environments at ₹0

The safe three-environment model remains intact:

- **Local:** local application and local Supabase stack for routine development.
- **Staging:** its own Vercel projects/environment and its own Supabase Free project; custom staging domain or protected provider URL; always `noindex`.
- **Production:** independent Vercel public/admin projects and a separate Supabase Free project.

Supabase currently permits two active Free projects. Use one for staging and one for production, preferably isolated in separate Free organizations if that improves quota separation. Preview deployments must never point at production data. [3](https://supabase.com/docs/guides/platform/billing-on-supabase)

Staging may be paused when not in use. Production can also be automatically paused by Supabase after low activity on the Free plan. A daily authenticated deep-health operation will verify database, Auth configuration, Storage access, and queue availability; it is an operational check, not a fake traffic generator. Auto-pause remains a documented Free-tier availability risk and disappears through an in-place Supabase plan upgrade. [6](https://supabase.com/docs/guides/platform/free-project-pausing)

## 11.3 Deployable units

- Public web application
- Admin web application
- Publishing/maintenance worker functions
- Database migrations and policies

Public and admin deploy independently from the monorepo. Shared package changes trigger only affected projects through path-aware build configuration.

Cloudflare is authoritative DNS. Vercel remains the application CDN/origin at launch; Cloudflare records for Vercel should use the provider-supported configuration and should not introduce a second HTML cache unless cache ownership and purge behavior are explicitly tested. Media delivery may use a stable `media.subtext.media` boundary, but its public contract is an immutable asset URL, not a Cloudflare-specific API.

## 11.4 Free-tier quota envelope

Current service limits change over time, so CI/operations must read the provider dashboards and maintain alerts. The launch envelope is deliberately below published maxima.

| Service | Current relevant free allowance | Subtext policy |
|---|---|---|
| GitHub Free | 2,000 private-repository Actions minutes/month; 500 MB artifact storage | Alert at 60%; fail optional jobs before core CI/backup is crowded out |
| Vercel Hobby | 100 GB fast data transfer, 1M function invocations, 4 active CPU-hours, and 5,000 image transformations/month under current docs | Do not use on-demand editorial image transformations; alert at 60%; cache public reads |
| Supabase Free | 500 MB database, 1 GB Storage, 5 GB egress, 500K Edge Function invocations, two active projects under current docs | Alert at 60%; block unnecessary uploads at 75%; begin upgrade before 80% |
| Cloudflare Free | Free authoritative DNS; plan-limited cache/security features | Keep DNS portable; use only documented Free features |
| Google OAuth | One admin and basic identity scopes | No broad Google API scopes; verification burden stays minimal |

[1](https://vercel.com/docs/plans/hobby) · [2](https://supabase.com/docs/guides/platform/org-based-billing) · [1](https://docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions) · [4](https://developers.cloudflare.com/dns/faq/)

Free-tier exhaustion must degrade safely:

- an image-processing quota cannot break already published images because variants are pre-generated;
- a worker timeout cannot create a partial publication because jobs are checkpointed and publication promotion is atomic;
- a CI-minute shortage cannot publish untested code because direct production deployment remains disabled by process;
- a database/storage threshold blocks new heavy writes before the provider forces read-only behavior;
- cached public pages should continue serving the last verified content during a short backend interruption where platform caching permits it;
- the admin UI shows quota/worker failures and never reports an unverified article as live.

## 11.5 Upgrade-ready dependency boundaries

“Abstract every dependency” does not mean building a generic cloud framework. Same-provider Free→Paid upgrades already preserve endpoints and data. Subtext will isolate only the boundaries that protect domain logic:

| Boundary | Stable Subtext contract | Free implementation | Paid upgrade effect |
|---|---|---|---|
| Configuration | Typed environment contract | Free project URLs/keys | Replace environment values only if provider issues new ones |
| Database | Versioned PostgreSQL schema and migrations | Supabase Free Postgres | Same database/project; no migration |
| Authentication | Internal `AdminIdentity`/authorization contract | Supabase Auth + Google | Same users/callback flow; plan toggle only |
| Object storage | Provider-neutral asset key, checksum, metadata, and variant records | Supabase Free Storage | Same buckets/keys; quota/plan change only |
| Job queue | `publication_jobs`/outbox state machine in Postgres | Supabase queue + short consumer | More compute/invocations; no job-data migration |
| Cache invalidation | Internal event: article/taxonomy/site tags | Next.js/Vercel invalidation endpoint | Same endpoint and tags; plan change only |
| Scheduler | Signed HTTP command with idempotency | Free cron/scheduled trigger | Scheduler configuration only |
| Media delivery | Stable Subtext asset URL/variant selection | Pre-generated files | More CDN quota or optional paid delivery configured behind same asset contract |
| Observability | Structured event/log schema and durable publication events | Provider logs + database events + CI notifications | Add retention/export sink by configuration/adaptor, not domain rewrite |

Provider SDK calls must stay in infrastructure adapters; article, revision, citation, media, and publication state logic must not import billing-plan concepts. No database column contains plan names or provider URLs. Stored assets use logical object keys, not hard-coded full delivery URLs.

The explicit guarantee is for **upgrading the selected providers from Free to Paid**, not for replacing a provider with an unrelated vendor. Provider replacement remains possible because boundaries are clean, but may require a new adapter and data transfer; it is not falsely promised as configuration-only.

## 11.6 CI/CD within GitHub Free

For code releases:

- formatting, type, and lint checks;
- unit tests for content parsing, authorization helpers, metadata, and state transitions;
- integration tests against an isolated database;
- end-to-end login and publish happy path in staging;
- migration validation;
- accessibility smoke tests;
- broken internal-link and sitemap checks;
- preview deployment review;
- production deployment with rollback support.

To stay inside 2,000 minutes/month:

- use Linux standard runners only;
- use dependency caching and path filters;
- cancel superseded runs;
- run fast checks on every change and full end-to-end suites on main/release candidates;
- keep artifact retention short;
- prohibit paid larger runners and set the Actions spending limit to ₹0.

Content publication does not invoke the code deployment pipeline.

## 11.7 Migrations, secrets, and plan upgrades

- All schema/RLS changes are versioned migrations.
- Production changes do not originate as untracked dashboard edits.
- Migration compatibility supports rolling web deployments.
- A logical database backup occurs before destructive migrations.
- Secrets are separate per environment.
- Public/publishable keys are distinguished from private/service keys.
- OAuth callback domains and CORS origins are exact, not broad wildcards.
- No payment method or usage-based overage is enabled merely to make launch work.
- Plan upgrades occur on the existing provider project/organization wherever possible.
- Upgrade runbooks include a pre-change backup, quota snapshot, configuration diff, smoke test, and rollback notes.

## 11.8 Upgrade triggers

An upgrade is initiated before, not after, service restriction when any condition occurs:

1. Vercel Hobby terms no longer permit the deployment’s use.
2. Any critical monthly quota exceeds 60% for two consecutive periods or 75% once.
3. Supabase database reaches 300 MB, Storage reaches 600 MB, or egress reaches 3 GB in a billing period.
4. GitHub Actions usage threatens the nightly backup or release test budget.
5. Auto-pausing, limited logs, or lack of managed backups creates unacceptable operational risk.
6. A traffic event is expected to exceed free capacity.
7. The founder requires a defined uptime/support commitment.

The first paid step is normally Vercel Pro when commercial eligibility requires it and Supabase Pro when availability/backups/quota require it. Neither step changes application code or database schema.

---

# 12. Scalability

## 12.1 Initial scale assumption

A single publication with hundreds or low tens of thousands of articles is comfortably within a relational database and CDN-backed application. Do not introduce Elasticsearch, Kubernetes, Kafka, a headless CMS product, or a fleet of microservices pre-emptively.

## 12.2 Scale path

| Pressure | First response | Later response only if measured |
|---|---|---|
| Reader traffic | CDN and cached server rendering | Regional compute/read replicas |
| More articles | Query/index review, pagination | Dedicated search engine |
| Search quality | Better weighting, synonyms, trigram | Meilisearch/OpenSearch/Algolia |
| More media | Lifecycle policy and image CDN | Dedicated media platform |
| Publishing bursts | Queue batching/retries | Dedicated worker runtime |
| Multiple writers | Add role/editorial workflow model | Separate team/tenant concepts only if product changes |
| Internationalization | Language fields and URL plan | Per-language search/index pipelines |

## 12.3 Future-proofing worth doing now

- stable UUIDs;
- immutable revisions;
- author entity despite one founder;
- explicit taxonomy IDs rather than strings;
- versioned content directive syntax;
- job idempotency;
- redirect history;
- environment-separated migrations;
- storage abstraction metadata;
- optional integration boundaries for future AI, newsletter, or external search.

Future-proofing not worth doing now:

- team permissions UI;
- plugin marketplace;
- arbitrary page builder;
- public accounts;
- comment system;
- generic workflow engine;
- multi-tenant database design;
- AI-generated required fields.

---

# 13. Risks

| Risk | Severity | Mitigation |
|---|---:|---|
| Deploying code on every article publication | Critical | Replace with DB publication + cache invalidation |
| Draft leakage through RLS, previews, Storage, or caching | Critical | Published-only DB interface; private buckets; adversarial tests |
| Sole admin account compromise or lockout | Critical | Exact-email hook, strong Google security, recovery runbook, session revocation |
| Editor cannot round-trip Markdown losslessly | High | Freeze block set; prototype before full CMS; one canonical format |
| Partial publication across article/search/cache/sitemap | High | Immutable revision, atomic promotion, idempotent jobs, retries, verification |
| Image processing makes Publish slow/unreliable | High | Process at upload; publish only verifies ready variants |
| Media copyright/provenance failure | High | Rights fields and hard publication gates |
| Vercel Hobby use becomes commercially ineligible | Critical | Terms gate before launch/monetization; in-place Vercel plan upgrade |
| Supabase Free auto-pause or quota restriction | High | Deep health check, 60% alerts, cached last-live content, in-place upgrade trigger |
| Free-tier backup/log retention is limited | High | Nightly encrypted logical export, founder media masters, quarterly restore test |
| Free-tier quota exhaustion | High | Pre-generated images, quota dashboard, safe write thresholds, documented upgrade runbook |
| No tested restore path | High | Independent backups and quarterly restore drill |
| Overbuilding a custom CMS for one user | High | Constrained blocks and workflow; phased scope |
| Excessive vendor coupling | Medium | Portable Markdown, Postgres, standard OAuth, exportable media metadata |
| Search performs poorly on names/transliterations | Medium | Combined FTS/trigram; synonyms after observing queries |
| Cache invalidation causes stale publication | Medium | Revision fingerprints, targeted invalidation, retry verification |
| External embeds harm privacy/performance | Medium | Strict allowlist and click-to-load/privacy modes |
| Accidental second-tab overwrite | Medium | Optimistic concurrency and local recovery |
| SEO harmed by changing URLs or dates | Medium | URL freeze, redirect history, date policy |
| Scope creep from “Notion + Medium + Linear” | High | Treat those as interaction principles, not feature parity |
| One founder becomes operational bottleneck | Medium | Automation, runbooks, simple managed stack, actionable alerts |

---

# 14. Missing Requirements — Closed Discovery Register

**Disposition:** Closed by founder approval at architecture freeze. This register is retained as the acceptance checklist and historical discovery record. Resolved product values belong in the implementation requirements and design specifications; they do not reopen the frozen infrastructure or domain architecture. Any item whose concrete value has not yet been supplied uses the recommended default already stated in this document and must be confirmed before its affected screen or workflow is accepted.

## 14.1 Product and editorial questions

1. **Acceptance input — Launch content types:** Are all launch items long-form articles, or must v1 support photo essays, profiles, interviews, timelines, data stories, videos, podcasts, or short notes?
2. **Acceptance input — Article block examples:** Can the founder provide 3–5 representative launch stories or outlines showing every required content block?
3. **Acceptance input — Canonical format:** Is Markdown required as the stored source of truth, or is Markdown import/export sufficient if structured JSON produces a better editor?
4. **Acceptance input — Citations:** Should citations be inline links, numbered footnotes, endnotes/bibliography, or multiple styles? Are private research notes required?
5. **Acceptance input — Taxonomy:** Is exactly one primary pillar required per article? Can an article also have secondary pillars?
6. Are the listed subcategories fixed, founder-editable, or expected to grow?
7. What distinguishes an important Society development from daily news in product terms? Does Society content expire or receive an “updated” treatment?
8. Are series/collections required at launch?
9. Are author pages needed even with one founder? Will guest contributors ever exist?
10. Is manual “related reading” curation needed, or is deterministic tag fallback enough?
11. Are featured homepage positions manually curated, chronological, or mixed?
12. Is an editorial/fact-check checklist required before Publish?
13. Is a visible correction/update note required for material revisions?
14. Should readers be able to print/save a clean article?

## 14.2 Audience and language

15. **Acceptance input — Language:** English only at launch? If English, should copy follow Indian, British, or American spelling/style?
16. **Acceptance input — Primary audience geography:** India-first, global English, or both? This affects hosting region, examples, dates, and metadata.
17. Is multilingual publishing a plausible two-year requirement? If yes, which languages and whether translations share one canonical story identity?
18. What date, number, and timezone presentation should readers see? Recommended operational storage is UTC and editorial display can use IST where relevant.
19. Is dark mode required?
20. Which browsers/devices must be supported? Recommended baseline: current and previous two major versions, with graceful degradation.
21. Confirm WCAG 2.2 AA as the accessibility requirement.

## 14.3 URL, publication, and lifecycle

22. **Acceptance input — URL format:** `/{pillar}/{slug}`, `/stories/{slug}`, or another structure?
23. **Acceptance input — Publishing schedule:** Must scheduled publishing be in v1? If yes, which timezone controls schedules?
24. **Acceptance input — Publish semantics:** May a publication be considered successful when the database is live but CDN verification is still retrying, or must the UI wait for verified public retrieval?
25. Should first publication require a confirmation/review screen or be truly immediate after one press?
26. Should updates preserve original `datePublished` and expose a visible last-updated date?
27. What should Unpublish do: return 404, 410, redirect, or keep an archival page?
28. How long should deleted drafts remain recoverable?
29. Can a published slug be edited? Recommended: only intentionally, always with a permanent redirect.
30. Should embargoed/private share links exist for external review?
31. Is per-article canonical override ever needed for syndicated content?

## 14.4 CMS workflow

32. **Acceptance input — Device scope:** Must full article creation/editing work on mobile, or is desktop/tablet enough?
33. **Acceptance input — Editor blocks:** Which of tables, footnotes, pull quotes, callouts, galleries, audio, video, maps, charts, timelines, documents, and embeds are required at launch?
34. Is raw Markdown source mode required, optional, or hidden?
35. Must existing content be imported? From what format and how many items?
36. What autosave behavior feels acceptable: near-real-time or explicit save with recovery?
37. How detailed should revision history be: every autosave, named checkpoints, or publication revisions only?
38. Is side-by-side revision diff needed at launch?
39. Are reusable snippets/templates required?
40. Is a media library independent of articles required, or can assets begin article-scoped?
41. Is copy/paste from Google Docs, Word, and Notion a launch requirement?
42. Is collaborative review by ChatGPT outside the platform sufficient, or are shareable comment/review links required?

## 14.5 Media

43. **Acceptance input — Media source:** Will images be original, licensed archives, Wikimedia/Creative Commons, stock, or mixed?
44. **Acceptance input — Rights gate:** What rights/credit fields must be mandatory before publication?
45. **Acceptance input — Media service budget:** Prefer Supabase Storage + custom preprocessing, or accept a managed image CDN/service for lower engineering overhead?
46. What maximum upload size and image dimensions are expected?
47. Are animated GIF, SVG, audio, video, PDF, or document uploads needed?
48. Will video be hosted by Subtext or embedded from YouTube/Vimeo?
49. Are image focal points and art-directed mobile crops required?
50. Should original EXIF/location metadata be stripped automatically? Recommended: yes from public variants.
51. Is hotlink prevention required?

## 14.6 Search and discovery

52. **Acceptance input — Search scope:** Search title/dek/body/tags only, or public citations and captions too?
53. Are category/year filters required at launch?
54. Should query analytics be retained to improve zero-result searches? If yes, define privacy/retention.
55. Are tags public landing pages, internal editorial tools, or both?
56. Is an A–Z/topic index needed?
57. Is RSS/Atom required at launch?
58. Is newsletter signup required? If yes, which provider and consent model?

## 14.7 Authentication and administration

59. **Acceptance input — Founder identity:** Is the exact Google email already final, and is it a Google Workspace account or consumer Gmail? The actual address should later be configured as a secret, not placed in documentation.
60. **Acceptance input — Additional MFA:** Is Google account MFA/passkey enough, or should the admin app require a second TOTP factor?
61. What is the recovery path if that Google account is unavailable?
62. Could a second emergency administrator ever be needed? Current architecture assumes no normal second admin but should support audited emergency recovery.
63. Should admin access be geographically/IP restricted? Usually not recommended for a travelling founder without a stable VPN.
64. What admin session duration is acceptable?

## 14.8 SEO, analytics, and growth

65. **Acceptance input — Analytics:** No analytics, privacy analytics, or Google Analytics? Which decisions must analytics support?
66. Are Google Search Console and Bing Webmaster Tools accounts available?
67. Are social preview networks limited to common Open Graph/X sharing, or are platform-specific cards needed?
68. Should social cards be generated from a fixed branded template or always use editorial photography?
69. Is a web app manifest/PWA behavior desired? Recommended: defer unless offline reading is a real requirement.
70. Are campaign/UTM parameters retained, stripped from canonical URLs, or measured?
71. Are reader bookmarks, reading lists, likes, or personalization explicitly out of scope? Recommended: out of scope.

## 14.9 Legal and privacy

72. **Acceptance input — Legal entity/jurisdiction:** What legal entity publishes Subtext, and which contact/address details may be public?
73. **Acceptance input — Privacy scope:** Will the site collect newsletter emails, analytics identifiers, contact submissions, or only server logs?
74. Are Terms, Privacy, Copyright, Editorial Standards, Corrections, and Takedown pages available or must they be drafted?
75. What retention policy applies to contact submissions and query analytics?
76. Is cookie consent required by the chosen analytics/embed configuration and target geography?
77. What is the process for copyright/takedown requests and source corrections?
78. Are any stories likely to contain sensitive personal data or allegations requiring legal review?

## 14.10 Infrastructure and operations

79. **Resolved — Monthly budget:** ₹0 at launch; use ZB-1 and upgrade at the documented legal/terms, capacity, backup, or reliability triggers.
80. **Resolved — Providers:** GitHub Free, eligible Vercel Hobby, Supabase Free, Cloudflare Free, and Google OAuth.
81. **Acceptance input — Capacity forecast:** Record expected articles at launch, articles per month, monthly readers, and likely traffic spikes so quota alerts can be calibrated.
82. **Resolved — Environments:** Local plus isolated staging and production; use the two available Supabase Free projects.
83. Who controls DNS for `subtext.media`, and can the required subdomain/OAuth records be changed?
84. Is email at the domain already configured, and must deployment avoid changing mail DNS?
85. What RPO/RTO is acceptable? Proposed defaults: ≤24-hour data loss and restoration within one business day.
86. Which channel should receive critical alerts: email, SMS, WhatsApp, or another service?
87. Is a maintenance window acceptable for rare database migrations?
88. Is data residency in India required, preferred, or irrelevant? Supabase/project region and backup location depend on this.
89. Is vendor portability a hard requirement or secondary to founder simplicity?
90. Is there a hard launch date?

## 14.11 Brand and design inputs

91. **Acceptance input — Brand assets:** Are logo/wordmark, color palette, and typography selected?
92. **Acceptance input — Design direction:** Provide 3–5 reference publications and identify what to emulate or avoid.
93. Is the voice sober/academic, cinematic, contemporary, or another defined combination?
94. What image treatment defines Subtext: full-bleed documentary photography, archive-first, illustration, or mixed?
95. Are there approved font licences and downloadable webfont files?
96. Does the brand require dark mode, motion, sound, or special transitions?
97. What belongs above the fold on the homepage: one lead story, multiple sections, a manifesto, or latest stories?

---

# Frozen architecture decisions

The founder approved the following on 8 August 2026:

1. Adopt a modular monolith in one monorepo with three deployable modules.
2. Keep public and admin domains/apps separate.
3. Use Supabase Postgres/Auth and exact-email Google admission with database-enforced authorization.
4. Reject unauthorized account creation using a Before User Created hook.
5. Treat immutable article revisions as publication units.
6. Remove code deployment from the content publishing workflow.
7. Use durable idempotent jobs with retries and verification.
8. Process media before the publish critical path and pre-generate derivatives.
9. Use Postgres FTS/trigram search initially.
10. Use deterministic metadata and reading-time rules; no AI.
11. Keep service-role credentials out of all browser code.
12. Separate private draft/original media from public derivatives.
13. Model citations, sources, and media rights as first-class data.
14. Keep Markdown canonical and prove lossless editor round-trip as an implementation acceptance test.
15. Use managed infrastructure rather than self-hosting.
16. Maintain staging/production isolation and tested independent backups.
17. Target WCAG 2.2 AA and explicit performance budgets.
18. Preserve redirects and correction/revision history.
19. Launch under ZB-1 using eligible free tiers only.
20. Make Free→Paid upgrades configuration/account changes with no code rewrite or database migration.

Changes to these decisions require a dated Architecture Decision Record. Product copy, visual details, and acceptance inputs do not require an ADR unless they alter one of the boundaries above.

---

# Implementation readiness and gates

## Gate 0 — Discovery: COMPLETE

- Architecture and product direction approved.
- Infrastructure posture finalized as ₹0 free tiers first, upgrade-ready (ZB-1).
- Discovery register closed as an architecture blocker.

## Gate 1 — Architecture freeze: COMPLETE

Approved deliverables:

- module and deployment boundaries;
- frozen free-tier topology and upgrade triggers;
- content/revision and publication model;
- authentication/authorization model;
- publishing state and job model;
- media, search, SEO, security, backup, and performance strategy;
- no-AI invariant.

## Gate 2 — Implementation specification: NEXT

Prepare before production feature coding:

1. Architecture Decision Record index, including ZB-1 and the Vercel eligibility gate.
2. Monorepo/application boundary map and environment-variable contract.
3. Entity-relationship diagram and table/data-retention catalogue.
4. RLS and Storage authorization matrix.
5. Publication and article lifecycle state-transition tables.
6. Markdown grammar/directive specification and round-trip acceptance corpus.
7. Public and admin information architecture, wireframes, and design tokens.
8. API/command/job contracts and stable error catalogue.
9. Test pyramid, threat model, performance budgets, and launch checklist.
10. Free-tier quota dashboard, backup/restore runbook, and provider upgrade runbook.

## Gate 3 — Foundation implementation

Suggested order:

1. Repository, CI, local environment, typed configuration, and migration workflow.
2. Supabase staging/production projects, Google OAuth clients, auth hook, RLS proof, and recovery procedure.
3. Content/revision schema and Markdown parser/renderer acceptance harness.
4. Admin shell and draft CRUD/autosave.
5. Media upload, rights data, variant generation, and private/public Storage policies.
6. Public article rendering and preview isolation.
7. Publication outbox/queue, atomic promotion, invalidation, and verification.
8. Taxonomy, home curation, search, sitemap, feeds, redirects, and SEO.
9. Rollback/unpublish, audit trail, backup automation, observability, and quota controls.
10. Accessibility, performance, security, restore, and launch tests.

## Gate 4 — Production launch

Launch requires:

- Vercel Hobby use is confirmed eligible under current terms, or the plan has been upgraded;
- founder Google account and emergency recovery are tested;
- staging publish/rollback/restore rehearsals pass;
- nightly encrypted backup succeeds and a restore test passes;
- all provider dashboards remain below the 60% alert threshold;
- domain, OAuth callback, robots, canonical, sitemap, and security-header checks pass;
- at least one real representative article passes the complete editorial/media/SEO workflow.

---

# Final assessment

The architecture is **FROZEN and ready for implementation specification** under operating profile ZB-1.

The vision remains feasible for a solo founder if Subtext avoids two traps:

1. **Do not build a generic Notion clone.** Build the smallest high-quality editorial grammar Subtext actually uses.
2. **Do not make content publication a deployment.** Publish an immutable database revision, invalidate targeted caches, and verify it.

The ₹0 strategy changes capacity and operational guarantees, not the architecture. The only hard external constraint is legal/terms eligibility for Vercel Hobby; that cannot be engineered away and must be checked before public launch and before monetization.
