# Remediation Phase 1 — Restoring the Validation Gate

**Date:** 2026-10-29
**Baseline:** system-wide forensic audit dated 2026-10-28
**Branch:** `arena/adf21293-subtext` (session branch; no merges to `main`)
**Status:** complete and awaiting review — no production, database, secret, DNS, or queue state was changed.

## Scope executed

1. Investigate PR #46 and the unmerged test-fix/migration-chain-fix lineage
   (`arena/9ae10312-subtext`, commit `fc24305`) identified by the audit.
2. Reconcile both against current `main` (`a4c0dd3`).
3. Implement the minimum complete set of code/test/migration-chain fixes on
   dedicated, reviewable commits.
4. Run the repository's prescribed validation (npm 11.19.0, Node 22.22.3).

## Reconciliation findings

### PR #46 (`fix/story-editor-quality-gate`, commit `198a18c`)

- Single file: `apps/admin/components/story-editor.tsx` (+8/−3).
- Introduces `persistRef` (ref + effect sync) so deferred save retries no
  longer reference `persist` inside its own `useCallback`
  (`react-hooks/immutability` — the CI failure on `main` since #41).
- **Contained byte-for-byte (functionally) in commit `b59dd7c`**; the lineage
  version adds only prettier normalization of the same file. No conflicts and
  no duplicated changes. PR #46 can be closed as superseded once this branch
  is reviewed (owner decision; not actioned here).

### Lineage `arena/9ae10312-subtext` (`fc24305`, based exactly on `a4c0dd3`)

Ten files changed. Disposition:

| Lineage file                                                             | Disposition                                                                            |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `apps/admin/components/story-editor.tsx`                                 | Adopted (= PR #46 fix + prettier; commit `b59dd7c`)                                    |
| `apps/admin/tests/cms-actions.test.ts`                                   | Adopted (commit `57c8c02`)                                                             |
| `apps/admin/tests/import-media-association.test.ts`                      | Adopted (commit `57c8c02`)                                                             |
| `supabase/migrations/20260919000200_restore_legacy_save_story_draft.sql` | Adopted (commit `a2e2b63`)                                                             |
| `supabase/migrations/20260919000300_story_media_save_v2.sql`             | Adopted (commit `a2e2b63`)                                                             |
| `scripts/database/generate-types.mjs`                                    | Adopted (commit `03094b7`)                                                             |
| `docs/database/*` regenerated artifacts (4 files)                        | Reproduced independently; **byte-identical** to lineage output; committed in `03094b7` |

No unintended side effects found in the adopted hunks; formatting-only hunks
were kept only inside files already part of the fix set.

### Other branches inspected

- `fix/db-search-projection-anomalies` — unrelated work (search-projection
  sync triggers + owner badge UI from the PR #47 lineage). Out of Phase 1
  scope; the F-001 gap (missing anon grant/policy) is not addressed there.
- `fix/ci-format-cms-actions` — stale formatting-only branch; superseded by
  the formatter step used in this run.

## Commits on `arena/adf21293-subtext`

| Commit                                     | Purpose                                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `b59dd7c96f0df0e155d8c1c0c1e22c286d0218cc` | fix(admin): story-editor persist lint error (supersedes PR #46)                                              |
| `57c8c02132db14cebd1b76e274433feea50cc3ac` | test(admin): reconcile save/media/import tests with current contracts                                        |
| `a2e2b636f6a9e4b3b130cea7872c675ba7b37171` | fix(db): unblock migration chain at story_media_save_v2 (42883) + qualify legacy article_tags delete (42702) |
| `03094b7f699301861aaedcc2e56632763558704f` | chore(db): emit save_story_draft_with_media in type generation; regenerate artifacts                         |
| `099f3f95466522e73e1e5e9b08860e7231b84dc9` | feat(db): proposed idempotent anon grant/policy for search_projection (**not applied**)                      |
| `785da9fc662dfe14e3965932ff6381bc72e7d6d8` | fix(admin): worker-dispatch diagnostics + truthful publish messaging                                         |
| `71fb7401a587deb7f5d005a0c5eb333e83c74b2d` | chore(db): regenerate schema artifacts for the proposed migration                                            |

## Validation evidence (npm 11.19.0)

Executed in the same order as `.github/workflows/ci.yml`
(`npm run format -- --write`, then `npm run check`), because `main` carries a
pre-existing prettier baseline: a plain `npm run format:check` on `main`
reports **22 files** needing formatting. Those 21 unrelated files were
reverted after validation (not part of this change set); CI formats before
gating, so CI behavior is unaffected.

Full `npm run check` result — **PASS (exit 0)**:

- format:check, lint (both apps), typecheck (6/6 turbo tasks) — pass
- tests: `@subtext/env` 4 passed; `@subtext/public` 22 passed;
  `@subtext/admin` **123 passed, 0 failed** (5 skipped) — previously 5 failed;
  deno suites 10 passed / 0 failed
- `db:validate` — pass (includes destructive rollback + reapply),
  now also exercising `20261029000100_search_projection_public_read.sql`
- `db:validate:step2b`, `auth:test:rls`, auth source boundaries,
  GitHub config contract, `cms:validate`, `publishing:validate`,
  `publishing:verify-source`, `launch:env:test` — pass
- generated-artifact gates: database, auth, CMS, publishing, public,
  launch — all synchronized
- builds (admin + public), `launch:build-audit` (176 KB gzip JS budget),
  `auth:verify-bundles` — pass

Standalone re-runs during the phase also passed: admin lint (exit 0),
`db:validate`, `db:check-generated`, admin test suite.

## Environment confirmation

- **Next.js remains `16.3.0`** in `apps/admin`, `apps/public`,
  `packages/supabase` — no dependency changes were made in this phase.
- No `.env` files, secrets, or credentials were read, written, or printed.

## Proposed migration (NOT applied)

`supabase/migrations/20261029000100_search_projection_public_read.sql`

- Restores the anon `SELECT` grant and `search_projection_public_select`
  policy (definitions mirrored from `20260808000700_row_level_security_and_grants.sql`)
  that the audit confirmed are missing on the live project and required by
  `/api/internal/publication` verification (audit finding F-001).
- Idempotent: `GRANT` no-ops when present; the policy is guarded by an
  existence check, so it is safe on fresh local replays and on the drifted
  live database, including repeated application.
- **Validated only in ephemeral local runs. Not applied to any shared
  database.** Deployment requires Gate 3 approval.

## Worker-dispatch diagnostics (separate proposal, in this branch)

`apps/admin/lib/publishing/dispatch.ts` + `apps/admin/components/story-editor.tsx`
(commit `785da9f`). Logs each attempt (env-var names, HTTP status, error text —
never secret values), returns `missing_env | http_error | network_error`, and
makes the editor message truthful when `workerDispatched` is false. No secret
rotation, no queue interaction; takes effect only when merged and deployed.

## Tests not run / limitations

- Production end-to-end (real GitHub login, live publish) — out of Phase 1
  scope; needs an approved test article (Gate 7).
- No live database, deployment, secret, DNS, or dead-letter operations were
  performed (per restrictions).
- GitHub branch-protection state remains unreadable via the integration
  (HTTP 403), unchanged from the audit.

## Remaining approvals before any production change

1. Gate 3 approval to apply `20261029000100_search_projection_public_read.sql`
   to the live Supabase project.
2. Approval to merge this branch (and then close/supersede PR #46).
3. Secret comparison/rotation approval (worker/revalidation secrets) — not yet done.
4. Dead-letter disposition approval (annotate vs. requeue) — untouched.
5. Domain/DNS cutover decision — untouched.
6. Approved test article for end-to-end acceptance (Gate 7).
