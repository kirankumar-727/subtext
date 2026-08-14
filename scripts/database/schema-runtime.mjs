import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = path.resolve(currentDirectory, "../..");
export const migrationsDirectory = path.join(repositoryRoot, "supabase/migrations");
export const rollbackDirectory = path.join(repositoryRoot, "supabase/rollbacks");
export const seedPath = path.join(repositoryRoot, "supabase/seed.sql");

const supabaseHarnessBootstrap = String.raw`
  create schema if not exists extensions;

  do $$
  begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end
  $$;

  create schema if not exists auth;

  create or replace function auth.jwt()
  returns jsonb
  language sql
  stable
  as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
  $$;

  create or replace function auth.uid()
  returns uuid
  language sql
  stable
  as $$
    select nullif(auth.jwt() ->> 'sub', '')::uuid;
  $$;

  create or replace function auth.role()
  returns text
  language sql
  stable
  as $$
    select coalesce(nullif(auth.jwt() ->> 'role', ''), 'anon');
  $$;

  create schema if not exists storage;

  create table if not exists storage.buckets (
    id text primary key,
    name text not null unique,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );

  create table if not exists storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text not null references storage.buckets(id) on delete cascade,
    name text not null,
    owner_id text,
    metadata jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (bucket_id, name)
  );

  alter table storage.buckets enable row level security;
  alter table storage.objects enable row level security;
  grant usage on schema auth, storage, extensions to anon, authenticated, service_role;
  grant select on storage.buckets, storage.objects to anon;
  grant select, insert, update, delete on storage.buckets, storage.objects to authenticated;
  grant all on storage.buckets, storage.objects to service_role;
`;

export async function listSqlFiles(directory) {
  const entries = await readdir(directory);
  return entries.filter((entry) => entry.endsWith(".sql")).sort();
}

export async function createSchemaDatabase() {
  const database = await PGlite.create({
    extensions: { pg_trgm },
  });
  await database.exec(supabaseHarnessBootstrap);
  return database;
}

export async function applySqlDirectory(database, directory, onApplied = () => {}) {
  const files = await listSqlFiles(directory);

  for (const file of files) {
    const sql = await readFile(path.join(directory, file), "utf8");
    await database.exec(sql);
    onApplied(file);
  }

  return files;
}

export async function applyMigrations(database, onApplied) {
  return applySqlDirectory(database, migrationsDirectory, onApplied);
}

export async function applySeed(database) {
  await database.exec(await readFile(seedPath, "utf8"));
}

export async function applyRollbacks(database, onApplied) {
  return applySqlDirectory(database, rollbackDirectory, onApplied);
}
