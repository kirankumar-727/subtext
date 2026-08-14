# Subtext Public Editorial Website

## Architecture

The public Next.js application reads only M2 safe views and the existing search RPC through a publishable Supabase client. It has no access to drafts, private source notes, original media, audit logs, publication jobs, founder configuration or service credentials. M5 publication state, immutable revision pointers and cache tags remain the only path by which content becomes visible.

Server-rendered routes use a shared cached editorial data layer. The application contains no account, comment, personalization, recommendation service or AI dependency.

## Page hierarchy

- `/` — curated featured collection, selected stories and four pillar sections
- `/history`, `/business`, `/psychology`, `/society` — pillar archives
- `/{pillar}/{slug}` — canonical long-form article
- `/search` — PostgreSQL FTS/trigram search with pillar filtering
- `/about` — editorial mission and method
- `/sitemap.xml` — published-only sitemap
- `/feed.xml` — published-only RSS

Historical paths are resolved by the M5 public redirect Proxy and return permanent 301 redirects.

## Content rendering flow

`published_articles` identifies the exact immutable revision. The article route augments canonical Markdown with revision-scoped citation definitions and renders it through `@subtext/content`. That shared pipeline supports CommonMark, GFM, tables, figures, footnotes, sanitized callouts, the `:::subtext` editorial directive and allowlisted embeds. Raw HTML remains disabled.

No second renderer or block representation exists.

## Homepage curation

The first live `featured_collections` sequence determines the lead and curated selection. When no collection is configured, the most recently published story is a restrained fallback; article IDs are never hardcoded. Pillar sections are populated only from the safe published projection.

## SEO architecture

Article metadata uses stored SEO/social overrides with title/dek fallbacks. Every article has canonical metadata, Article Open Graph data, X/Twitter data, index/follow directives, semantic headings, Article JSON-LD and BreadcrumbList JSON-LD. Search is intentionally noindex. Sitemap and RSS read only `published_articles`.

## Search architecture

`/search` calls `search_published_articles`, the existing weighted PostgreSQL FTS and trigram RPC. Results contain only public projection fields and can be filtered by pillar. No draft table, source note, audit or external search provider is queried.

## Media delivery

Public pages query `published_media`, which excludes original storage keys and non-public variants. `<picture>`/`srcset` selects deterministic derivatives with intrinsic width and height. Heroes load eagerly with high fetch priority; card and body images lazy-load. Alt text and captions come from revision-scoped placement metadata.

## Cache and revalidation

Published article, citation and media datasets are server cached with the M5 `published-articles` tag. The publishing coordinator invalidates exact canonical/redirect paths, homepage, pillar/category paths, article/pillar/search tags, sitemap and RSS. Publication never invokes a deployment.

## Related stories

Recommendations are deterministic: same pillar, then same category, then shared tags, with publication date as a stable tie-breaker. No behavioural tracking or AI recommendation system is involved.

## Accessibility

The site uses semantic landmarks, a skip link, named navigation, correct heading hierarchy, visible focus states, intrinsic images, accessible search labels, semantic dates, sufficient contrast and reduced-motion handling. Mobile typography, line length and full-bleed hero treatment are designed independently rather than scaled down mechanically.

## Security

Anonymous readers can access only safe RLS-backed views/RPCs. Admin links and data are absent. Internal publication and cron endpoints require independent server-only secrets. Browser bundle scanning verifies no protected environment marker or configured secret reaches static assets.
