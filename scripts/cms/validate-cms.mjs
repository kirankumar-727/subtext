import assert from "node:assert/strict";
import { applyMigrations, applySeed, createSchemaDatabase } from "../database/schema-runtime.mjs";

async function rejects(operation, label) {
  let failed = false;
  try {
    await operation();
  } catch {
    failed = true;
  }
  assert.equal(failed, true, label);
}
const db = await createSchemaDatabase();
try {
  await applyMigrations(db);
  await applySeed(db);
  const founderId = "80000000-0000-4000-8000-000000000001";
  await db.query(`select set_config('request.jwt.claims',$1,false)`, [
    JSON.stringify({
      sub: founderId,
      role: "authenticated",
      email: "founder@subtext.media",
      user_role: "admin",
    }),
  ]);
  await db.exec("set role authenticated");
  const created = await db.query(
    `select * from public.create_story_draft($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      "A New History",
      "a-new-history",
      "First excerpt",
      "# A New History\n\nOriginal markdown.",
      "A New History Original markdown.",
      "10000000-0000-4000-8000-000000000001",
      null,
      5,
      1,
    ],
  );
  const story = created.rows[0];
  assert.ok(story.article_id);
  assert.ok(story.revision_id);
  const source = await db.query(
    `insert into public.sources(source_type,title,author_text,url,created_by) values('book','The Archive','A Historian','https://example.com/archive',$1) returning id`,
    [founderId],
  );
  const saved = await db.query(
    `select * from public.save_story_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      story.article_id,
      story.row_version,
      "A Revised History",
      "a-revised-history",
      "Updated excerpt",
      "# A Revised History\n\nCanonical **Markdown** persists.[^src-1]",
      "A Revised History Canonical Markdown persists.",
      "10000000-0000-4000-8000-000000000001",
      "11000000-0000-4000-8000-000000000003",
      [],
      [source.rows[0].id],
      null,
      "A Revised History",
      "Research-driven history.",
      7,
      1,
    ],
  );
  assert.ok(saved.rows[0].row_version > story.row_version);
  const revisions = await db.query(
    `select revision_number,body_markdown from public.article_revisions where article_id=$1 order by revision_number`,
    [story.article_id],
  );
  assert.equal(revisions.rows.length, 2);
  assert.match(revisions.rows[0].body_markdown, /Original markdown/);
  assert.match(revisions.rows[1].body_markdown, /Canonical \*\*Markdown\*\*/);
  const citations = await db.query(
    `select citation_key from public.citations where revision_id=$1`,
    [saved.rows[0].revision_id],
  );
  assert.equal(citations.rows[0].citation_key, "src-1");
  await rejects(
    () =>
      db.query(
        `select * from public.save_story_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          story.article_id,
          story.row_version,
          "Conflict",
          "conflict",
          "",
          "x",
          "x",
          "10000000-0000-4000-8000-000000000001",
          null,
          [],
          [],
          null,
          "",
          "",
          1,
          1,
        ],
      ),
    "Stale autosave version unexpectedly succeeded",
  );
  const job = await db.query(`select * from public.request_story_publication($1,'publish',$2,$3)`, [
    story.article_id,
    saved.rows[0].revision_id,
    "80000000-0000-4000-8000-000000000002",
  ]);
  assert.equal(job.rows[0].job_status, "queued");
  await db.query(
    `insert into storage.objects(bucket_id,name) values('media-originals','80000000-0000-4000-8000-000000000003/test.jpg')`,
  );
  await db.exec("reset role");
  await db.query(`select set_config('request.jwt.claims',$1,false)`, [
    JSON.stringify({
      sub: "80000000-0000-4000-8000-000000000004",
      role: "authenticated",
      email: "other@example.com",
      user_role: null,
    }),
  ]);
  await db.exec("set role authenticated");
  await rejects(
    () =>
      db.query(
        `select * from public.create_story_draft('Denied','denied','','x','x','10000000-0000-4000-8000-000000000001',null,1,1)`,
      ),
    "Unauthorized story creation unexpectedly succeeded",
  );
  await rejects(
    () =>
      db.query(
        `insert into storage.objects(bucket_id,name) values('media-originals','80000000-0000-4000-8000-000000000004/denied.jpg')`,
      ),
    "Unauthorized media upload unexpectedly succeeded",
  );
  await db.exec("reset role");
  console.log(
    "CMS atomic creation, autosave, immutable revisions, source attachment, publishing, media RLS, and rejection tests passed.",
  );
} finally {
  await db.close();
}
