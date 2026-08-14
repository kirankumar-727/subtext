# Launch and Content Rollback Procedure

## Bad article revision

1. Do not edit the historical revision.
2. Open story History in Admin.
3. Request rollback to the last verified revision.
4. Observe job claim, validation, commit, revalidation and success events.
5. Verify canonical article, search, sitemap and RSS.
6. Record a correction/update note in the next editorial revision where appropriate.

## Remove an article

1. Use Unpublish—never delete the article.
2. Verify public route is inaccessible and search/sitemap/RSS entries disappear.
3. Preserve revisions, citations, media provenance, audit and slug history.

## Bad code deployment

1. Stop content publication if the public coordinator is failing.
2. Roll back the Vercel deployment to the last known-good build.
3. Do not alter publication rows manually.
4. Re-dispatch pending/failed jobs after the application is healthy.
5. Run production black-box validation.

## Migration rollback

The destructive development rollback script is not a routine production rollback mechanism. Restore from backup or deploy a reviewed forward-fix migration. Never run destructive rollback against production media/content without a verified backup and explicit incident approval.
