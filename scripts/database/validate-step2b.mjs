import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  applyMigrations,
  applySeed,
  createSchemaDatabase,
  migrationsDirectory,
} from "./schema-runtime.mjs";

const migrationName = "20260824000100_step2b_live_schema_reconciliation.sql";
const migrationPath = path.join(migrationsDirectory, migrationName);
const workerFunctions = [
  "append_publication_event",
  "claim_publication_jobs",
  "extend_publication_job_lease",
  "commit_publication_job",
  "mark_publication_job_verifying",
  "succeed_publication_job",
  "fail_publication_job",
];

function log(message) {
  process.stdout.write(`  ✓ ${message}\n`);
}

async function expectDatabaseError(operation, label) {
  let failed = false;
  try {
    await operation();
  } catch {
    failed = true;
  }
  assert.equal(failed, true, label);
}

async function assumeRole(database, role, claims) {
  await database.exec("reset role");
  await database.query("select set_config('request.jwt.claims',$1,false)", [claims]);
  await database.exec(`set role ${role}`);
}

async function validateMigrationScope(database, sql) {
  const executableSql = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  assert.doesNotMatch(executableSql, /\bdrop\s+(table|column|schema|function|trigger)\b/i);
  assert.doesNotMatch(executableSql, /\btruncate\b/i);
  assert.doesNotMatch(executableSql, /\bcreate\s+policy\b|\bdrop\s+policy\b/i);
  assert.doesNotMatch(executableSql, /\bdisable\s+row\s+level\s+security\b/i);
  assert.doesNotMatch(executableSql, /\bcreate\s+index\b/i);
  assert.doesNotMatch(executableSql, /regexp_matches|citation_reference_missing/i);
  assert.doesNotMatch(executableSql, /private\.attach_revision_relations\s*\(/i);
  assert.doesNotMatch(executableSql, /processing_status\s*=\s*'ready'/i);
  assert.doesNotMatch(executableSql, /default_alt_text/i);
  log(
    "revised migration contains only the two replacements, with no helper call, readiness/default-alt behavior, regex, duplicate-index DDL, or destructive schema/RLS operation",
  );

  // CREATE OR REPLACE FUNCTION is the only object replacement in the revised
  // migration. Applying it a second time verifies safe repeatability.
  await database.exec(sql);
  log("revised migration reapplies cleanly without additional objects");
}

async function validateCatalog(database) {
  const indexes = await database.query(`
    select indexname
    from pg_indexes
    where schemaname = 'public'
      and indexname in (
        'publication_jobs_article_created_idx',
        'publication_jobs_target_revision_idx',
        'publication_events_job_time_idx',
        'publication_jobs_article_fk_idx',
        'publication_jobs_target_revision_fk_idx',
        'publication_events_job_fk_idx'
      )
    order by indexname
  `);
  assert.deepEqual(
    indexes.rows.map(({ indexname: indexName }) => indexName),
    ["publication_events_job_time_idx", "publication_jobs_article_created_idx"],
  );
  log(
    "existing publication leading-column indexes remain and no duplicate Step 2B indexes were added",
  );

  const rls = await database.query(`
    select c.relname as table_name
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not c.relrowsecurity
  `);
  assert.deepEqual(rls.rows, []);

  const requiredPolicies = await database.query(`
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and (
        (tablename = 'article_tags' and policyname in ('article_tags_admin_all', 'article_tags_public_select'))
        or (tablename = 'citations' and policyname in ('citations_admin_insert', 'citations_admin_select', 'citations_public_select'))
        or (tablename = 'article_media' and policyname in ('article_media_admin_insert', 'article_media_admin_select', 'article_media_public_select'))
      )
    order by tablename, policyname
  `);
  assert.deepEqual(requiredPolicies.rows, [
    { tablename: "article_media", policyname: "article_media_admin_insert" },
    { tablename: "article_media", policyname: "article_media_admin_select" },
    { tablename: "article_media", policyname: "article_media_public_select" },
    { tablename: "article_tags", policyname: "article_tags_admin_all" },
    { tablename: "article_tags", policyname: "article_tags_public_select" },
    { tablename: "citations", policyname: "citations_admin_insert" },
    { tablename: "citations", policyname: "citations_admin_select" },
    { tablename: "citations", policyname: "citations_public_select" },
  ]);

  const relationshipPrivileges = await database.query(`
    select
      has_table_privilege('authenticated', 'public.article_tags', 'select,insert,update,delete') as article_tags,
      has_table_privilege('authenticated', 'public.article_revisions', 'select,insert') as article_revisions,
      has_table_privilege('authenticated', 'public.citations', 'select,insert') as citations,
      has_table_privilege('authenticated', 'public.article_media', 'select,insert') as article_media
  `);
  assert.deepEqual(relationshipPrivileges.rows[0], {
    article_tags: true,
    article_revisions: true,
    citations: true,
    article_media: true,
  });
  log("relationship grants, RLS policies, and existing live-aligned access remain in place");

  const workerCatalog = await database.query(
    `
    select
      p.proname as function_name,
      has_function_privilege('service_role', p.oid, 'execute') as service_execute,
      has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
      has_function_privilege('anon', p.oid, 'execute') as anon_execute,
      pg_get_functiondef(p.oid) as definition
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any($1::text[])
    order by p.proname
  `,
    [workerFunctions],
  );
  assert.equal(workerCatalog.rows.length, workerFunctions.length);
  for (const row of workerCatalog.rows) {
    assert.equal(row.service_execute, true, `${row.function_name} lacks service_role execute`);
    assert.equal(
      row.authenticated_execute,
      false,
      `${row.function_name} is executable by authenticated`,
    );
    assert.equal(row.anon_execute, false, `${row.function_name} is executable by anon`);
    assert.match(row.definition, /auth\.role\(\)/i);
    assert.match(row.definition, /service_role/i);
  }
  log("existing database-side worker commands remain present and service_role-only");
}

async function validateCmsAndPublicationBehavior(database) {
  await applySeed(database);

  const seedBefore = (
    await database.query(`
      select
        (select count(*) from public.pillars)::integer as pillars,
        (select count(*) from public.categories)::integer as categories,
        (select count(*) from public.site_settings)::integer as settings
    `)
  ).rows[0];

  const founderId = "82000000-0000-0000-0000-000000000001";
  const adminClaims = JSON.stringify({
    sub: founderId,
    role: "authenticated",
    email: "founder@subtext.media",
    user_role: "admin",
  });
  await assumeRole(database, "authenticated", adminClaims);

  const created = (
    await database.query(
      `select * from public.create_story_draft('Step 2B Story','step-2b-story','Excerpt','# Step 2B Story\n\nDraft.','Step 2B Story Draft.','10000000-0000-4000-8000-000000000001',null,3,1)`,
    )
  ).rows[0];
  assert.ok(created.article_id);
  assert.ok(created.revision_id);
  assert.equal(created.row_version, 2);

  const source = (
    await database.query(
      `insert into public.sources(source_type,title,url,created_by) values('report','Step 2B source','https://example.com/step-2b',$1) returning id`,
      [founderId],
    )
  ).rows[0];
  const firstTagId = "83000000-0000-0000-0000-000000000001";
  const secondTagId = "83000000-0000-0000-0000-000000000002";
  await database.query(
    `insert into public.tags(id,name,slug) values ($1,'First Step 2B tag','first-step-2b'),($2,'Second Step 2B tag','second-step-2b')`,
    [firstTagId, secondTagId],
  );
  const pendingMediaId = "84000000-0000-0000-0000-000000000001";
  await database.query(
    `
      insert into public.media_assets(
        id, original_filename, original_storage_key, checksum_sha256,
        mime_type, byte_size, default_alt_text
      ) values ($1,'pending.jpg',$2,$3,'image/jpeg',100,'Should not be copied')
    `,
    [pendingMediaId, `${pendingMediaId}/pending.jpg`, "a".repeat(64)],
  );

  const beforeSave = (
    await database.query(
      `select row_version, revision_counter from public.articles where id = $1`,
      [created.article_id],
    )
  ).rows[0];
  const saved = (
    await database.query(
      `select * from public.save_story_draft($1,$2,'Step 2B Story Updated','step-2b-story-updated','Updated excerpt','# Step 2B Story Updated\n\nDocumented.[^src-1]','Step 2B Story Updated Documented.','10000000-0000-4000-8000-000000000001',null,array[$4]::uuid[],array[$3]::uuid[],null,'Step 2B Story Updated','A validated Step 2B story.',5,1)`,
      [created.article_id, beforeSave.row_version, source.id, firstTagId],
    )
  ).rows[0];
  const afterSave = (
    await database.query(
      `select row_version, revision_counter from public.articles where id = $1`,
      [created.article_id],
    )
  ).rows[0];
  assert.equal(afterSave.row_version, beforeSave.row_version + 1);
  assert.equal(saved.row_version, afterSave.row_version);
  assert.equal(afterSave.revision_counter, beforeSave.revision_counter + 1);
  const revisionCount = (
    await database.query(
      `select count(*)::integer as count from public.article_revisions where article_id = $1`,
      [created.article_id],
    )
  ).rows[0].count;
  assert.equal(afterSave.revision_counter, revisionCount);
  const firstTags = await database.query(
    `select tag_id from public.article_tags where article_id = $1 order by tag_id`,
    [created.article_id],
  );
  assert.deepEqual(firstTags.rows, [{ tag_id: firstTagId }]);
  const firstCitation = (
    await database.query(
      `select citation_key, citation_text, is_public from public.citations where revision_id = $1`,
      [saved.revision_id],
    )
  ).rows[0];
  assert.deepEqual(firstCitation, {
    citation_key: "src-1",
    citation_text: "Step 2B source",
    is_public: true,
  });
  log("save_story_draft replaces tags and generates citations directly");
  log("save_story_draft increments row_version exactly once and keeps revision_counter consistent");

  await expectDatabaseError(
    () =>
      database.query(
        `select * from public.save_story_draft($1,$2,'Stale','stale','','x','x','10000000-0000-4000-8000-000000000001',null,'{}'::uuid[],'{}'::uuid[],null,'','',1,1)`,
        [created.article_id, beforeSave.row_version],
      ),
    "Stale row-version write unexpectedly succeeded",
  );
  const afterStale = (
    await database.query(
      `select row_version, revision_counter from public.articles where id = $1`,
      [created.article_id],
    )
  ).rows[0];
  assert.deepEqual(afterStale, afterSave);
  log("stale row-version writes remain rejected without changing counters");

  const secondSaved = (
    await database.query(
      `select * from public.save_story_draft($1,$2,'Step 2B Story With Pending Media','step-2b-story-with-pending-media','Updated excerpt','# Step 2B Story With Pending Media\n\nDocumented.','Step 2B Story With Pending Media Documented.','10000000-0000-4000-8000-000000000001',null,array[$4]::uuid[],array[$3]::uuid[],$5,'Step 2B Story With Pending Media','A validated Step 2B story with pending media.',9,2)`,
      [created.article_id, afterStale.row_version, source.id, secondTagId, pendingMediaId],
    )
  ).rows[0];
  const afterSecondSave = (
    await database.query(
      `select row_version, revision_counter from public.articles where id = $1`,
      [created.article_id],
    )
  ).rows[0];
  assert.equal(afterSecondSave.row_version, afterStale.row_version + 1);
  assert.equal(secondSaved.row_version, afterSecondSave.row_version);
  assert.equal(afterSecondSave.revision_counter, afterStale.revision_counter + 1);
  const secondRevisionCount = (
    await database.query(
      `select count(*)::integer as count from public.article_revisions where article_id = $1`,
      [created.article_id],
    )
  ).rows[0].count;
  assert.equal(afterSecondSave.revision_counter, secondRevisionCount);
  const secondTags = await database.query(
    `select tag_id from public.article_tags where article_id = $1 order by tag_id`,
    [created.article_id],
  );
  assert.deepEqual(secondTags.rows, [{ tag_id: secondTagId }]);
  const secondCitation = (
    await database.query(
      `select citation_key, citation_text, is_public from public.citations where revision_id = $1`,
      [secondSaved.revision_id],
    )
  ).rows[0];
  assert.deepEqual(secondCitation, {
    citation_key: "src-1",
    citation_text: "Step 2B source",
    is_public: true,
  });
  const heroMedia = (
    await database.query(
      `select media_asset_id, role, position, alt_text from public.article_media where revision_id = $1`,
      [secondSaved.revision_id],
    )
  ).rows[0];
  assert.deepEqual(heroMedia, {
    media_asset_id: pendingMediaId,
    role: "hero",
    position: 0,
    alt_text: null,
  });
  const pendingAsset = (
    await database.query(
      `select processing_status, default_alt_text from public.media_assets where id = $1`,
      [pendingMediaId],
    )
  ).rows[0];
  assert.deepEqual(pendingAsset, {
    processing_status: "pending",
    default_alt_text: "Should not be copied",
  });
  log(
    "pending hero media is related directly without readiness validation or default-alt-text propagation",
  );

  await expectDatabaseError(
    () =>
      database.query(`update public.article_revisions set title = 'Mutable' where id = $1`, [
        saved.revision_id,
      ]),
    "Revision update unexpectedly succeeded",
  );
  await expectDatabaseError(
    () => database.query(`delete from public.article_revisions where id = $1`, [saved.revision_id]),
    "Revision delete unexpectedly succeeded",
  );
  assert.equal(
    (
      await database.query(
        `select count(*)::integer as count from public.article_revisions where article_id = $1`,
        [created.article_id],
      )
    ).rows[0].count,
    3,
  );
  log("revision immutability remains enforced and prior revision data is retained");

  const validatorDefinition = await database.query(
    `select pg_get_functiondef('private.validate_revision_for_publication(uuid,uuid)'::regprocedure) as definition`,
  );
  assert.doesNotMatch(
    validatorDefinition.rows[0].definition,
    /regexp_matches|citation_reference_missing/i,
  );
  const validIssues = await database.query(
    `select code, severity from private.validate_revision_for_publication($1,$2)`,
    [created.article_id, saved.revision_id],
  );
  assert.equal(
    validIssues.rows.some((row) => row.severity === "error"),
    false,
  );
  const mismatchIssues = await database.query(
    `select code, severity from private.validate_revision_for_publication($1,'00000000-0000-0000-0000-000000000099')`,
    [created.article_id],
  );
  assert.deepEqual(mismatchIssues.rows[0], {
    code: "revision_mismatch",
    severity: "error",
  });
  log("existing publication validator remains unchanged and still enforces revision ownership");

  const seedAfter = (
    await database.query(`
      select
        (select count(*) from public.pillars)::integer as pillars,
        (select count(*) from public.categories)::integer as categories,
        (select count(*) from public.site_settings)::integer as settings
    `)
  ).rows[0];
  assert.deepEqual(seedAfter, seedBefore);
  assert.equal(
    (
      await database.query(
        `select count(*)::integer as count from public.article_revisions where id = $1`,
        [created.revision_id],
      )
    ).rows[0].count,
    1,
  );
  log("existing seeded data and the original revision remain intact");
}

async function validateRlsBehavior(database) {
  await assumeRole(database, "anon", JSON.stringify({ role: "anon" }));
  await expectDatabaseError(
    () => database.query("select count(*) from public.source_notes"),
    "Anonymous source-note read unexpectedly succeeded",
  );

  const authenticatedClaims = JSON.stringify({
    sub: "82000000-0000-0000-0000-000000000099",
    role: "authenticated",
    user_role: null,
  });
  await assumeRole(database, "authenticated", authenticatedClaims);
  const privateRows = await database.query(
    "select count(*)::integer as count from public.source_notes",
  );
  assert.equal(privateRows.rows[0].count, 0);
  await expectDatabaseError(
    () =>
      database.query(
        `insert into public.tags(name,slug) values('Unauthorized Step 2B tag','unauthorized-step-2b')`,
      ),
    "Unauthorized authenticated tag mutation unexpectedly succeeded",
  );
  await expectDatabaseError(
    () => database.query(`select * from public.claim_publication_jobs('unauthorized-worker',1,30)`),
    "Authenticated worker claim unexpectedly succeeded",
  );
  log("anonymous and unauthorized authenticated RLS behavior remains unchanged");
}

const migrationSql = await readFile(migrationPath, "utf8");
const database = await createSchemaDatabase();
try {
  const applied = await applyMigrations(database);
  assert.ok(applied.includes(migrationName), "revised Step 2B migration was not applied");
  await validateMigrationScope(database, migrationSql);
  await validateCatalog(database);
  await validateCmsAndPublicationBehavior(database);
  await validateRlsBehavior(database);
} finally {
  await database.close();
}

process.stdout.write(
  "\nRevised Step 2B migration validation passed in the local PGlite harness.\n",
);
