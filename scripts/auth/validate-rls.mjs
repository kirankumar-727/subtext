import assert from "node:assert/strict";

import { applyMigrations, applySeed, createSchemaDatabase } from "../database/schema-runtime.mjs";

async function expectDatabaseRejection(operation, message) {
  let rejected = false;
  try {
    await operation();
  } catch {
    rejected = true;
  }
  assert.equal(rejected, true, message);
}

const database = await createSchemaDatabase();

try {
  await applyMigrations(database);
  await applySeed(database);

  await database.exec("set role anon");
  await expectDatabaseRejection(
    () => database.query("select * from public.articles"),
    "Anonymous role unexpectedly read the protected articles table",
  );
  const publicPillars = await database.query("select slug from public.pillars order by sort_order");
  assert.equal(publicPillars.rows.length, 4);
  await database.exec("reset role");
  process.stdout.write("  ✓ anonymous requests cannot read protected editorial rows\n");

  await database.query(
    `select set_config('request.jwt.claims', '{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated","email":"other@example.com","user_role":null}', false)`,
  );
  await database.exec("set role authenticated");
  await expectDatabaseRejection(
    () =>
      database.query(
        "insert into public.authors (name, slug) values ('Unauthorized', 'unauthorized')",
      ),
    "Authenticated non-admin unexpectedly mutated an RLS-protected table",
  );
  await database.exec("reset role");
  process.stdout.write("  ✓ authenticated unauthorized mutations are rejected by RLS\n");

  await database.query(
    `select set_config('request.jwt.claims', '{"sub":"70000000-0000-4000-8000-000000000002","role":"authenticated","email":"founder@subtext.media","user_role":"admin"}', false)`,
  );
  await database.exec("set role authenticated");
  const adminCheck = await database.query("select private.is_admin() as authorized");
  assert.equal(adminCheck.rows[0].authorized, true);
  await database.query(
    "insert into public.authors (name, slug) values ('Authorized Founder', 'authorized-founder')",
  );
  const inserted = await database.query(
    "select name from public.authors where slug = 'authorized-founder'",
  );
  assert.equal(inserted.rows[0].name, "Authorized Founder");
  await database.exec("reset role");
  process.stdout.write("  ✓ server-issued admin claim authorizes RLS-scoped operations\n");
} finally {
  await database.close();
}

process.stdout.write("Authentication/RLS integration validation passed.\n");
