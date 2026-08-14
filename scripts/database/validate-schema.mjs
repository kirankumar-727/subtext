import assert from "node:assert/strict";

import {
  applyMigrations,
  applyRollbacks,
  applySeed,
  createSchemaDatabase,
} from "./schema-runtime.mjs";

const expectedTables = [
  "article_media",
  "article_revisions",
  "article_tags",
  "articles",
  "audit_logs",
  "authors",
  "categories",
  "citations",
  "featured_collection_items",
  "featured_collections",
  "media_assets",
  "media_variants",
  "pillars",
  "publication_events",
  "publication_jobs",
  "redirects",
  "search_projection",
  "site_settings",
  "slug_history",
  "source_notes",
  "sources",
  "tags",
];

const expectedViews = [
  "public_redirects",
  "public_site_settings",
  "published_articles",
  "published_citations",
  "published_featured_collections",
  "published_media",
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

async function validateCatalog(database) {
  const tableResult = await database.query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name
  `);
  assert.deepEqual(
    tableResult.rows.map(({ table_name: tableName }) => tableName),
    expectedTables,
  );
  log(`${expectedTables.length} expected base tables exist`);

  const viewResult = await database.query(`
    select table_name
    from information_schema.views
    where table_schema = 'public'
    order by table_name
  `);
  assert.deepEqual(
    viewResult.rows.map(({ table_name: tableName }) => tableName),
    expectedViews,
  );
  log(`${expectedViews.length} safe public views exist`);

  const primaryKeyResult = await database.query(`
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not exists (
        select 1 from pg_constraint pc
        where pc.conrelid = c.oid and pc.contype = 'p'
      )
  `);
  assert.deepEqual(primaryKeyResult.rows, []);
  log("every base table has a primary key");

  const rlsResult = await database.query(`
    select relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not c.relrowsecurity
  `);
  assert.deepEqual(rlsResult.rows, []);
  log("RLS is enabled on every base table");

  const policyResult = await database.query(`
    select c.relname as table_name, count(p.polname)::integer as policy_count
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_policy p on p.polrelid = c.oid
    where n.nspname = 'public' and c.relkind = 'r'
    group by c.relname
    having count(p.polname) = 0
  `);
  assert.deepEqual(policyResult.rows, []);
  log("every base table has at least one explicit RLS policy");

  const commentResult = await database.query(`
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and obj_description(c.oid, 'pg_class') is null
  `);
  assert.deepEqual(commentResult.rows, []);
  log("every base table has a database purpose comment");

  const generatedColumns = await database.query(`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public' and is_generated = 'ALWAYS'
    order by table_name, column_name
  `);
  assert.deepEqual(generatedColumns.rows, [
    { table_name: "article_revisions", column_name: "content_checksum" },
    { table_name: "search_projection", column_name: "search_vector" },
    { table_name: "sources", column_name: "source_fingerprint" },
  ]);
  log("generated checksums and search vectors are present");

  const foreignKeyResult = await database.query(`
    select count(*)::integer as count
    from pg_constraint c
    join pg_namespace n on n.oid = c.connamespace
    where n.nspname = 'public' and c.contype = 'f'
  `);
  assert.ok(foreignKeyResult.rows[0].count >= 30);
  log(`${foreignKeyResult.rows[0].count} foreign-key constraints validated`);
}

async function validateBehavior(database) {
  await applySeed(database);

  const seedCounts = await database.query(`
    select
      (select count(*) from public.pillars)::integer as pillars,
      (select count(*) from public.categories)::integer as categories,
      (select count(*) from public.site_settings)::integer as settings
  `);
  assert.deepEqual(seedCounts.rows[0], { pillars: 4, categories: 12, settings: 2 });
  log("minimal deterministic seed data is valid");

  const authorId = "20000000-0000-4000-8000-000000000001";
  const articleId = "30000000-0000-4000-8000-000000000001";
  const tagId = "40000000-0000-4000-8000-000000000001";

  await database.query(
    `insert into public.authors (id, name, slug) values ($1, 'Subtext Editorial', 'subtext-editorial')`,
    [authorId],
  );
  await database.query(
    `insert into public.tags (id, name, slug) values ($1, 'Vijayanagara', 'vijayanagara')`,
    [tagId],
  );
  await database.query(
    `
      insert into public.articles (
        id, author_id, primary_pillar_id, category_id, canonical_slug, canonical_path
      ) values (
        $1, $2,
        '10000000-0000-4000-8000-000000000001',
        '11000000-0000-4000-8000-000000000004',
        'hampi-beyond-the-ruins',
        '/placeholder/placeholder'
      )
    `,
    [articleId, authorId],
  );
  await database.query(`insert into public.article_tags (article_id, tag_id) values ($1, $2)`, [
    articleId,
    tagId,
  ]);

  const revisionResult = await database.query(
    `
      insert into public.article_revisions (
        article_id,
        revision_kind,
        title,
        dek,
        body_markdown,
        body_plain_text,
        word_count,
        reading_time_minutes,
        seo_description
      ) values (
        $1,
        'publication',
        'Hampi Beyond the Ruins',
        'The political and sacred landscape behind a monumental capital.',
        '# Hampi Beyond the Ruins\n\nA research-driven test revision.',
        'Hampi Beyond the Ruins. A research-driven test revision.',
        240,
        2,
        'The political and sacred landscape behind Hampi.'
      )
      returning id, revision_number, content_checksum
    `,
    [articleId],
  );
  const revision = revisionResult.rows[0];
  assert.equal(revision.revision_number, 1);
  assert.match(revision.content_checksum, /^[0-9a-f]{64}$/);
  log("revision numbering and generated SHA-256 checksum work");

  await database.query(
    `
      update public.articles
      set
        current_draft_revision_id = $2,
        published_revision_id = $2,
        status = 'published_pending_verification',
        first_published_at = now(),
        last_published_at = now()
      where id = $1
    `,
    [articleId, revision.id],
  );

  const projectionResult = await database.query(
    `select title, canonical_path, tags, search_vector::text as vector from public.search_projection where article_id = $1`,
    [articleId],
  );
  assert.equal(projectionResult.rows[0].title, "Hampi Beyond the Ruins");
  assert.equal(projectionResult.rows[0].canonical_path, "/history/hampi-beyond-the-ruins");
  assert.deepEqual(projectionResult.rows[0].tags, ["Vijayanagara"]);
  assert.match(projectionResult.rows[0].vector, /hampi/);
  log("atomic publication pointer refreshes the generated search projection");

  const publicArticleResult = await database.query(
    `select title, canonical_path from public.published_articles where id = $1`,
    [articleId],
  );
  assert.deepEqual(publicArticleResult.rows[0], {
    title: "Hampi Beyond the Ruins",
    canonical_path: "/history/hampi-beyond-the-ruins",
  });

  const searchResult = await database.query(
    `select title from public.search_published_articles('Hampi', null, 20, 0)`,
  );
  assert.equal(searchResult.rows[0].title, "Hampi Beyond the Ruins");
  log("published view and FTS/trigram search return the live revision");

  await expectDatabaseError(
    () =>
      database.query(`update public.article_revisions set title = 'Mutated' where id = $1`, [
        revision.id,
      ]),
    "Immutable revision update unexpectedly succeeded",
  );
  await expectDatabaseError(
    () => database.query(`delete from public.article_revisions where id = $1`, [revision.id]),
    "Immutable revision delete unexpectedly succeeded",
  );
  log("immutable revision update/delete guards reject mutation");

  await database.query(
    `update public.articles set canonical_slug = 'hampi-the-hidden-capital' where id = $1`,
    [articleId],
  );
  const redirectResult = await database.query(
    `select from_path, to_path from public.redirects where article_id = $1`,
    [articleId],
  );
  assert.deepEqual(redirectResult.rows[0], {
    from_path: "/history/hampi-beyond-the-ruins",
    to_path: "/history/hampi-the-hidden-capital",
  });
  const historyResult = await database.query(
    `select path from public.slug_history where article_id = $1`,
    [articleId],
  );
  assert.equal(historyResult.rows[0].path, "/history/hampi-beyond-the-ruins");
  log("canonical path changes create one redirect and immutable slug history row");

  await expectDatabaseError(
    () =>
      database.query(
        `
          insert into public.articles (
            author_id, primary_pillar_id, category_id, canonical_slug, canonical_path
          ) values (
            $1,
            '10000000-0000-4000-8000-000000000002',
            '11000000-0000-4000-8000-000000000001',
            'invalid-taxonomy',
            '/placeholder/invalid'
          )
        `,
        [authorId],
      ),
    "Cross-pillar category unexpectedly succeeded",
  );
  log("cross-pillar category assignments are rejected");

  const jobResult = await database.query(
    `
      insert into public.publication_jobs (
        article_id, target_revision_id, action, idempotency_key
      ) values ($1, $2, 'republish', '50000000-0000-4000-8000-000000000001')
      returning id, expected_content_checksum
    `,
    [articleId, revision.id],
  );
  assert.equal(jobResult.rows[0].expected_content_checksum, revision.content_checksum);

  await database.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
  const claimResult = await database.query(
    `select id, status, attempt_count from public.claim_publication_jobs('schema-test-worker', 1, 60)`,
  );
  assert.equal(claimResult.rows[0].status, "processing");
  assert.equal(claimResult.rows[0].attempt_count, 1);
  log("publication job checksums, idempotency, and SKIP LOCKED claim path work");

  const auditResult = await database.query(
    `select count(*)::integer as count from public.audit_logs`,
  );
  assert.ok(auditResult.rows[0].count > 0);
  log("mutation triggers write append-only audit records");
}

async function validateRollback() {
  const database = await createSchemaDatabase();

  try {
    await applyMigrations(database);
    await applyRollbacks(database);

    const remainingResult = await database.query(`
      select count(*)::integer as count
      from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
    `);
    assert.equal(remainingResult.rows[0].count, 0);

    const bucketResult = await database.query(`
      select count(*)::integer as count
      from storage.buckets
      where id in ('media-originals', 'media-public')
    `);
    assert.equal(bucketResult.rows[0].count, 0);

    await applyMigrations(database);
    const reappliedResult = await database.query(`
      select count(*)::integer as count
      from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
    `);
    assert.equal(reappliedResult.rows[0].count, expectedTables.length);
    log("destructive rollback removes all project objects and migrations reapply cleanly");
  } finally {
    await database.close();
  }
}

async function main() {
  process.stdout.write("\nSubtext database schema validation\n");
  const database = await createSchemaDatabase();

  try {
    const migrations = await applyMigrations(database);
    log(`${migrations.length} ordered Supabase migrations apply cleanly`);
    await validateCatalog(database);
    await validateBehavior(database);
  } finally {
    await database.close();
  }

  await validateRollback();
  process.stdout.write("\nDatabase schema validation passed.\n");
}

await main();
