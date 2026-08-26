# Subtext Writer Workspace

## CMS architecture

The Writer Workspace is a protected Next.js application over the frozen M2 PostgreSQL contract and M3 authorization boundary. Markdown is the sole canonical body format. The UI never stores a parallel JSON block tree.

All pages are protected by the `/admin` server layout. Every query uses the request-scoped Supabase client and RLS. Every mutation begins with `requireAdmin()`. Three additive SQL RPCs provide transaction-safe draft creation, immutable revision saves, and publication requests without changing any M2 table or enum.

## Writer workflow

1. Open `/admin` and select **New Story**.
2. Enter a title and pillar; the server atomically creates the article and first immutable revision.
3. Write canonical Markdown with toolbar shortcuts.
4. Metadata, cover, tags, and sources are edited contextually beside the document.
5. Autosave creates a new immutable revision and atomically advances `current_draft_revision_id`.
6. Preview uses `@subtext/content`, the same renderer intended for public article pages.
7. Publish/Unpublish/Rollback enqueue a `publication_jobs` row. The UI does not execute or duplicate the publishing worker.

## Editor data flow

The client owns an in-memory draft only. At save time it sends a typed payload to a server action. The server re-authorizes, validates with Zod, deterministically derives plain text, word count, and reading time, then invokes `save_story_draft`. PostgreSQL locks the article, checks `row_version`, inserts a new immutable revision, replaces article-level tags, snapshots citations and cover placement, advances the draft pointer, and returns the new version.

The client never supplies author identity or authorization. The atomic RPC derives both from `auth.uid()` and the signed `user_role=admin` claim.

## Markdown rendering pipeline

`@subtext/content` provides one sanitized rendering pipeline for editor preview and future public rendering:

- CommonMark Markdown
- GFM tables, task/list syntax, autolinks, and strikethrough
- headings, quotes, code, figures, captions, and footnotes
- `:::callout` directives
- allowlisted privacy-oriented YouTube/Vimeo embed directives
- raw HTML is not executed
- rehype sanitization runs after directive transformation

Markdown-to-plain-text metrics are deterministic and AI-free.

## Autosave strategy

- 1.6-second trailing debounce limits database writes.
- Cmd/Ctrl+S triggers an immediate save.
- Only one save runs at a time.
- `row_version` detects stale tabs and returns an explicit conflict.
- Unsaved content is mirrored to story-scoped `localStorage`.
- Local recovery is offered only when its base version still matches the server version.
- Save state is always visible: Unsaved changes, Saving, Saved, or Error.
- Successful saves remove the matching local recovery copy.

## Revision workflow

Article revision rows remain immutable. Every meaningful save inserts a new row linked through `supersedes_revision_id`; it never updates a previous draft or published revision. The article points to the current draft and published revisions independently. Basic history is visible in the editor, and rollback creates a publication job targeting an existing immutable revision.

## Media workflow

An authorized server action creates a one-time signed upload intent, so the browser sends image bytes directly to Supabase Storage instead of crossing Vercel request-size limits. The token is scoped to one private object path and carries no CMS authorization. A second authorized server action downloads and verifies the checksum/size before processing. The original object remains only in the private `media-originals` bucket. Sharp reads orientation and metadata, then produces deterministic WebP derivatives at fixed widths without upscaling. Public derivatives go to `media-public`; `media_assets` and `media_variants` preserve checksums, dimensions, alt text, credit, rights, and processing state. Failed processing is explicit. Private original keys are never rendered in the browser.

## Source and citation workflow

Sources use the M2 `sources` fields and are managed at `/admin/sources`. Selected source IDs are sent with a draft save. The atomic save creates immutable revision-scoped `citations` with stable `src-N` keys. The editor inserts matching `[^src-N]` Markdown references. No second citation model exists.

## Publishing workflow

Publish, republish, unpublish, and rollback call `request_story_publication`. The SQL command validates the revision, selects the correct action and target revision, creates an idempotent queued `publication_jobs` row, and marks the article `publishing`. A later publishing-engine milestone consumes the queue. M4 does not deploy content or implement worker side effects.

## Admin security boundaries

- `/admin/*` is protected by M3 Proxy and the server layout.
- Server loaders call `requireAdmin()` before querying.
- Server actions call `requireAdmin()` before parsing or mutating.
- Request-scoped clients retain RLS enforcement.
- Media Storage writes use the founder JWT and Storage policies.
- No service-role credential is used by CMS actions.
- Source scanners enforce guards on every admin action/API.
- Browser bundle scanning remains part of the quality gate.

## Routes

- `/admin`
- `/admin/stories`
- `/admin/stories/new`
- `/admin/stories/[id]`
- `/admin/media`
- `/admin/sources`
- `/admin/pillars`
- `/admin/categories`
- `/admin/tags`
- `/admin/authors` — read-only public byline records
- `/admin/settings`

## Testing

`npm run cms:validate` executes real PostgreSQL behavior for creation, autosave, immutable revisions, source attachment, publication requests, authorized media writes, stale-version conflicts, and unauthorized rejection. Component/unit tests cover metadata validation, canonical Markdown persistence, recovery rules, debounce, and shared preview rendering.
