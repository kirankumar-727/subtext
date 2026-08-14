# Subtext Publishing Engine

## Architecture

Publishing is a data transition, never an application deployment. M4 enqueues immutable-revision intents in `publication_jobs`. The M5 Supabase Edge Function claims and processes them. PostgreSQL owns locking, leases, state transitions, commit/rollback safety, search synchronization, and event sequencing. The public Next.js application owns renderer preflight, targeted cache invalidation, sitemap/RSS invalidation, and public projection verification.

Normal publication requests dispatch the worker immediately after the server action returns. On Vercel Hobby, a signed daily Cron endpoint re-dispatches it for crash/retry recovery because free Cron schedules may run only once per day. The durable database queue remains authoritative if either dispatch path is unavailable. A paid production plan may change this recovery schedule to every ten minutes without changing worker logic.

## Job lifecycle and state machine

- `queued` — durable intent, not yet leased.
- `processing` — atomically claimed with worker ID, lease, and attempt number.
- `committed` — database pointer/state/search transaction completed.
- `verifying` — public rendering, cache, redirects, sitemap, RSS, and search are being verified.
- `succeeded` — verified terminal success.
- `failed` — retryable failure with exponential `available_at` backoff.
- `dead_letter` — permanent validation failure or exhausted retries; never silently discarded.
- `cancelled` — explicit terminal cancellation supported by the frozen contract.

Expired leases in `processing`, `committed`, or `verifying` can be reclaimed. Committed/verifying recovery does not repeat the database promotion.

## Worker architecture

`supabase/functions/publishing-worker` is server-only and requires `PUBLISHING_WORKER_SECRET`. It uses the Supabase secret key only inside Edge Function secrets. A run claims up to three jobs using `FOR UPDATE SKIP LOCKED`, processes sequentially within the free execution envelope, and emits structured publication events.

Stages:

1. Claim and lease.
2. Load exact article/revision/source/media snapshot.
3. Validate checksum, ownership, immutability, metadata, taxonomy, citations, directives, HTML, media readiness, rights, and public variants.
4. Ask the public application to render canonical Markdown through `@subtext/content` before commit.
5. Atomically promote/unpublish the database projection.
6. Enter verification.
7. Revalidate exact article, redirects, home, pillar/category, search tags, sitemap, and RSS.
8. Verify published article/search/redirect projections through anonymous RLS-safe views.
9. Mark success.

## Idempotency strategy

- Job creation has a unique idempotency key.
- Claiming uses row locks, `SKIP LOCKED`, worker ownership, and expiring leases.
- The immutable target revision and expected checksum are pinned in the job.
- Publish/republish rejects a stale target when the draft pointer has moved.
- Database commit returns `already_committed` on repetition and never creates a new revision.
- Revalidation operations are path/tag based and safe to repeat.
- `succeed_publication_job` is a no-op after success.
- Publication events use an atomic per-job sequence.

## Publication transaction

`commit_publication_job` locks the job and article. It revalidates the exact immutable revision, citation/source integrity, media state, checksum, SEO metadata, and stale-request rule. In one transaction it updates `published_revision_id`, publication timestamps, pending-verification state, search projection (via existing trigger), job state, audit records, and publication event. Public views therefore never point at a missing search/document state.

## Unpublish flow

Unpublish keeps the article, every revision, citations, audit history, slug history, and redirects. The transaction changes visibility to `unpublished`; existing search triggers remove `search_projection`. Public verification requires both article and search projections to be absent, then invalidates canonical/taxonomy/home/sitemap/RSS caches.

## Rollback flow

Rollback targets an existing immutable revision. It never edits history or the current draft. The same validation, renderer preflight, atomic pointer promotion, search refresh, cache invalidation, and verification stages run. The operation is observable as `publication_action=rollback`.

## Search synchronization

M2 search synchronization remains authoritative. Article status/pointer changes refresh or delete `search_projection` in the same database transaction. The public coordinator verifies the row and revision/path match before success. No external search system is involved.

## Cache, sitemap, and RSS

The signed `/api/internal/publication` endpoint performs deterministic targeted invalidation:

- canonical and historical redirect paths;
- homepage;
- pillar and category paths;
- article, pillar, homepage, search, and published-article tags;
- `/sitemap.xml`;
- `/feed.xml`.

Both sitemap and RSS query only `published_articles`, so drafts and unpublished articles cannot appear. No build or deployment hook exists in the publishing path.

## Retry and failure recovery

Retryable network, timeout, 429, and 5xx failures become `failed` with exponential backoff: 30, 60, 120, 240 seconds, capped at one hour. Validation, stale intent, unsupported content, and renderer rejection are permanent. Exhausted jobs become `dead_letter`.

Before database commit, failure restores the article to draft or its last published state. After commit, the article remains `published_pending_verification`; a recovered worker resumes verification without moving the pointer again. Every claim, validation, commit, verification, retry, and terminal failure is recorded.

Recovery covers worker crash, duplicate dispatch, expired lease, network outage, database error, partial external operation, and repeated processing.

## Security and privacy

- Worker, cron, and revalidation endpoints each require independent server-side secrets.
- Secret/service credentials never enter browser bundles.
- Public verification uses the publishable key and RLS-safe views.
- Draft revisions, source notes, audit logs, jobs, and private original keys are absent from public projections.
- Publication rejects media without ready, rights-cleared public derivatives.
- Error details use stable codes and generic messages; secrets and private content are not logged.

## Operations

Deploy the worker with JWT verification disabled because its dedicated high-entropy invocation secret is verified in code:

`supabase functions deploy publishing-worker --no-verify-jwt`

Hosted Supabase injects `SUPABASE_URL` and the `SUPABASE_SECRET_KEYS` JSON dictionary automatically; the worker reads its `default` key. Local CLI development may use the singular `SUPABASE_SECRET_KEY` fallback. Configure only `PUBLISHING_WORKER_SECRET`, `PUBLICATION_API_URL`, and `REVALIDATION_SECRET` as custom Function secrets. Configure matching worker/revalidation/cron secrets only in the relevant Vercel server environments.

Run `npm run publishing:validate` for database lifecycle/concurrency/recovery tests.
