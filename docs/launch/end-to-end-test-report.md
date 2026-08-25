# End-to-End Launch Test Report

## Current result

**Production E2E: NOT EXECUTED — blocked by deployment and domain configuration.**

The automated PostgreSQL and application suites validate the same lifecycle primitives, but they are not a substitute for a real GitHub-authenticated browser session, deployed Edge Function, production CDN, DNS or real media transfer.

## Required validation story

Use `launch-validation-story.md` as the staging content pack. Enter every field through the real Writer Workspace:

1. Founder GitHub login.
2. New Story.
3. Title, excerpt, History pillar and Archaeology category.
4. Canonical Markdown including quote, table, footnote and `:::subtext`.
5. Founder-owned/licensed cover and inline image with alt/caption/credit/rights.
6. Source and citation.
7. SEO title/description.
8. Preview and save.
9. Publish through the publication job/worker.

Do not insert or update article records in SQL, Supabase Studio or scripts.

## Report fields

| Stage                    | Evidence                                   | Result  |
| ------------------------ | ------------------------------------------ | ------- |
| Founder login            | Timestamp/session screenshot without token | Pending |
| First immutable revision | Revision ID/checksum (non-secret)          | Pending |
| Publication job          | Job ID and succeeded status                | Pending |
| Public canonical article | URL/HTTP 200                               | Pending |
| Search                   | Query and canonical result                 | Pending |
| Sitemap                  | Canonical URL present                      | Pending |
| RSS                      | Canonical URL present                      | Pending |
| Old slug                 | HTTP 301 and Location                      | Pending |
| Revision B               | Preserved revision ID                      | Pending |
| Rollback to A            | Public checksum/content evidence           | Pending |
| Unpublish                | Article/search/sitemap/RSS absent          | Pending |
| Republish                | All surfaces restored                      | Pending |
| Failure recovery         | Event sequence and terminal success        | Pending |

## Private-data review

Inspect article HTML, public API responses and browser network requests. Confirm absence of source notes, private original paths, audit/job data, founder email, service keys and worker/revalidation secrets.
