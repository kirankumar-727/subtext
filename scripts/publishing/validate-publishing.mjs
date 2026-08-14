import assert from "node:assert/strict";
import { applyMigrations, applySeed, createSchemaDatabase } from "../database/schema-runtime.mjs";
const db = await createSchemaDatabase();
const founder = "91000000-0000-4000-8000-000000000001";
const adminClaims = JSON.stringify({
  sub: founder,
  role: "authenticated",
  email: "founder@subtext.media",
  user_role: "admin",
});
const serviceClaims = JSON.stringify({
  sub: "91000000-0000-4000-8000-000000000099",
  role: "service_role",
});
async function role(name, claims) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims',$1,false)", [claims]);
  await db.exec(`set role ${name}`);
}
async function createValidStory() {
  await role("authenticated", adminClaims);
  const created = (
    await db.query(
      `select * from public.create_story_draft('Engine Story','engine-story','','# Engine Story\n\nDraft.','Engine Story Draft.','10000000-0000-4000-8000-000000000001',null,3,1)`,
    )
  ).rows[0];
  const source = (
    await db.query(
      `insert into public.sources(source_type,title,url,created_by) values('report','Verified Report','https://example.com/report',$1) returning id`,
      [founder],
    )
  ).rows[0];
  const saved = (
    await db.query(
      `select * from public.save_story_draft($1,$2,'Engine Story','engine-story-live','A documented story.','# Engine Story\n\nDocumented.[^src-1]','Engine Story Documented.','10000000-0000-4000-8000-000000000001',null,'{}'::uuid[],array[$3]::uuid[],null,'Engine Story','A documented story for publication.',4,1)`,
      [created.article_id, created.row_version, source.id],
    )
  ).rows[0];
  return { created, saved, source };
}
async function requestJob(articleId, action, target, id) {
  await role("authenticated", adminClaims);
  return (
    await db.query(`select * from public.request_story_publication($1,$2,$3,$4)`, [
      articleId,
      action,
      target,
      id,
    ])
  ).rows[0];
}
async function claim(worker) {
  await role("service_role", serviceClaims);
  return (await db.query(`select * from public.claim_publication_jobs($1,1,120)`, [worker])).rows;
}
async function processDatabase(job, worker) {
  await role("service_role", serviceClaims);
  const commit = (
    await db.query(`select * from public.commit_publication_job($1,$2)`, [job.id, worker])
  ).rows[0];
  const repeat = (
    await db.query(`select * from public.commit_publication_job($1,$2)`, [job.id, worker])
  ).rows[0];
  assert.equal(repeat.already_committed, true);
  await db.query(`select public.mark_publication_job_verifying($1,$2)`, [job.id, worker]);
  await db.query(`select public.succeed_publication_job($1,$2,'{"verified":true}'::jsonb)`, [
    job.id,
    worker,
  ]);
  await db.query(`select public.succeed_publication_job($1,$2,'{}'::jsonb)`, [job.id, worker]);
  return commit;
}
try {
  await applyMigrations(db);
  await applySeed(db);
  const { created, saved, source } = await createValidStory();
  assert.equal(
    (
      await db.query(`select count(*)::int n from public.published_articles where id=$1`, [
        created.article_id,
      ])
    ).rows[0].n,
    0,
    "Draft article leaked into public projection",
  );
  const requested = await requestJob(
    created.article_id,
    "publish",
    saved.revision_id,
    "91000000-0000-4000-8000-000000000002",
  );
  assert.equal(requested.job_status, "queued");
  await role("service_role", serviceClaims);
  const claimDefinition = await db.query(
    `select pg_get_functiondef('public.claim_publication_jobs(text,integer,integer)'::regprocedure) as definition`,
  );
  assert.match(claimDefinition.rows[0].definition, /for update skip locked/i);
  const claimA = await db.query(`select * from public.claim_publication_jobs('worker-a',1,120)`);
  const claimB = await db.query(`select * from public.claim_publication_jobs('worker-b',1,120)`);
  const claims = [...claimA.rows, ...claimB.rows];
  assert.equal(claims.length, 1, "Two workers claimed the same job");
  const worker = claimA.rows.length ? "worker-a" : "worker-b";
  const job = claims[0];
  const commit = await processDatabase(job, worker);
  assert.equal(
    commit.content_checksum,
    (
      await db.query(`select content_checksum from public.article_revisions where id=$1`, [
        saved.revision_id,
      ])
    ).rows[0].content_checksum,
  );
  const publicRow = await db.query(
    `select revision_id from public.published_articles where id=$1`,
    [created.article_id],
  );
  assert.equal(publicRow.rows[0].revision_id, saved.revision_id);
  assert.equal(
    (
      await db.query(`select count(*)::int n from public.search_projection where article_id=$1`, [
        created.article_id,
      ])
    ).rows[0].n,
    1,
  );
  const redirect = (
    await db.query(`select http_status from public.redirects where article_id=$1`, [
      created.article_id,
    ])
  ).rows[0];
  assert.equal(redirect.http_status, 301);
  assert.equal(
    (
      await db.query(
        `select count(*)::int n from public.publication_events where publication_job_id=$1`,
        [job.id],
      )
    ).rows[0].n >= 4,
    true,
  );
  const secondClaims = await claim("duplicate-worker");
  assert.equal(secondClaims.length, 0);
  // Save and publish a newer immutable revision, then roll back to the previous valid revision.
  await role("authenticated", adminClaims);
  const article = (
    await db.query(`select row_version from public.articles where id=$1`, [created.article_id])
  ).rows[0];
  const newer = (
    await db.query(
      `select * from public.save_story_draft($1,$2,'Engine Story Updated','engine-story-updated','Updated.','# Updated\n\nNew content.[^src-1]','Updated New content.','10000000-0000-4000-8000-000000000001',null,'{}'::uuid[],array[$3]::uuid[],null,'Updated','Updated publication description.',4,1)`,
      [created.article_id, article.row_version, source.id],
    )
  ).rows[0];
  const republishReq = await requestJob(
    created.article_id,
    "republish",
    newer.revision_id,
    "91000000-0000-4000-8000-000000000003",
  );
  const republish = (await claim("worker-republish"))[0];
  await processDatabase(republish, "worker-republish");
  assert.equal(
    (
      await db.query(`select published_revision_id from public.articles where id=$1`, [
        created.article_id,
      ])
    ).rows[0].published_revision_id,
    newer.revision_id,
  );
  const rollbackReq = await requestJob(
    created.article_id,
    "rollback",
    saved.revision_id,
    "91000000-0000-4000-8000-000000000004",
  );
  const rollback = (await claim("worker-rollback"))[0];
  await processDatabase(rollback, "worker-rollback");
  assert.equal(
    (
      await db.query(`select published_revision_id from public.articles where id=$1`, [
        created.article_id,
      ])
    ).rows[0].published_revision_id,
    saved.revision_id,
  );
  assert.ok(rollbackReq && republishReq);
  // Unpublish preserves revisions while removing public/search projections.
  await requestJob(created.article_id, "unpublish", null, "91000000-0000-4000-8000-000000000005");
  const unpublish = (await claim("worker-unpublish"))[0];
  await processDatabase(unpublish, "worker-unpublish");
  assert.equal(
    (
      await db.query(`select count(*)::int n from public.published_articles where id=$1`, [
        created.article_id,
      ])
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await db.query(`select count(*)::int n from public.search_projection where article_id=$1`, [
        created.article_id,
      ])
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await db.query(`select count(*)::int n from public.article_revisions where article_id=$1`, [
        created.article_id,
      ])
    ).rows[0].n,
    3,
  );
  // Retry, exponential backoff, permanent failure, and stale lease recovery.
  const retryReq = await requestJob(
    created.article_id,
    "publish",
    newer.revision_id,
    "91000000-0000-4000-8000-000000000006",
  );
  const retryJob = (await claim("worker-retry"))[0];
  await role("service_role", serviceClaims);
  const retry = (
    await db.query(
      `select * from public.fail_publication_job($1,'worker-retry','network_timeout','{}'::jsonb,true)`,
      [retryJob.id],
    )
  ).rows[0];
  assert.equal(retry.final_status, "failed");
  assert.ok(retry.next_attempt_at);
  await db.exec("reset role");
  await db.query(`update public.publication_jobs set available_at=now() where id=$1`, [
    retryJob.id,
  ]);
  const reclaimed = (await claim("worker-restart"))[0];
  assert.equal(reclaimed.id, retryJob.id);
  await role("service_role", serviceClaims);
  const permanent = (
    await db.query(
      `select * from public.fail_publication_job($1,'worker-restart','validation_failed','{}'::jsonb,false)`,
      [retryJob.id],
    )
  ).rows[0];
  assert.equal(permanent.final_status, "dead_letter");
  assert.ok(retryReq);
  // A crashed processing worker loses its expired lease and another worker recovers it.
  await role("authenticated", adminClaims);
  const latestArticle = (
    await db.query(`select row_version from public.articles where id=$1`, [created.article_id])
  ).rows[0];
  const restartRevision = (
    await db.query(
      `select * from public.save_story_draft($1,$2,'Restart Safe','restart-safe','Restart.','# Restart\n\nSafe.[^src-1]','Restart Safe.','10000000-0000-4000-8000-000000000001',null,'{}'::uuid[],array[$3]::uuid[],null,'Restart Safe','Restart-safe publication.',3,1)`,
      [created.article_id, latestArticle.row_version, source.id],
    )
  ).rows[0];
  await requestJob(
    created.article_id,
    "publish",
    restartRevision.revision_id,
    "91000000-0000-4000-8000-000000000007",
  );
  const crashed = (await claim("crashed-worker"))[0];
  await db.exec("reset role");
  await db.query(
    `update public.publication_jobs set leased_at=now()-interval '2 minutes', lease_expires_at=now()-interval '1 second' where id=$1`,
    [crashed.id],
  );
  const recovered = (await claim("recovery-worker"))[0];
  assert.equal(recovered.id, crashed.id);
  assert.equal(recovered.worker_id, "recovery-worker");
  // Public projection cannot expose private original storage metadata.
  const safeColumns = await db.query(
    `select column_name from information_schema.columns where table_schema='public' and table_name='published_media'`,
  );
  assert.equal(
    safeColumns.rows.some((row) => row.column_name === "original_storage_key"),
    false,
  );
  console.log(
    "Publishing claim concurrency, idempotency, publish, rollback, unpublish, search, redirects, retries, dead-letter, and restart recovery passed.",
  );
} finally {
  await db.close();
}
