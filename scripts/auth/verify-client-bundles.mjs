import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const staticDirectories = [
  path.join(repositoryRoot, "apps/admin/.next/static"),
  path.join(repositoryRoot, "apps/public/.next/static"),
];
const forbiddenMarkers = [
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SECRET_KEYS",
  "FOUNDER_EMAIL",
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET",
  "BEFORE_USER_CREATED_HOOK_SECRET",
  "CUSTOM_ACCESS_TOKEN_HOOK_SECRET",
  "PUBLISHING_WORKER_SECRET",
  "REVALIDATION_SECRET",
  "CRON_SECRET",
  ...[
    process.env.SUPABASE_SECRET_KEY,
    process.env.FOUNDER_EMAIL,
    process.env.SUPABASE_ACCESS_TOKEN,
    process.env.SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET,
    process.env.BEFORE_USER_CREATED_HOOK_SECRET,
    process.env.CUSTOM_ACCESS_TOKEN_HOOK_SECRET,
    process.env.PUBLISHING_WORKER_SECRET,
    process.env.REVALIDATION_SECRET,
    process.env.CRON_SECRET,
  ].filter((value) => value && value.length >= 8),
];

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(target) : [target];
    }),
  );
  return nested.flat();
}

for (const directory of staticDirectories) {
  const files = await listFiles(directory);
  for (const file of files) {
    if (!/\.(?:js|css|json|map)$/.test(file)) continue;
    const content = await readFile(file, "utf8");
    for (const marker of forbiddenMarkers) {
      assert.equal(
        content.includes(marker),
        false,
        `Privileged server marker found in browser bundle ${path.relative(repositoryRoot, file)}`,
      );
    }
  }
}

for (const serverOnlyModule of [
  "packages/supabase/src/admin.ts",
  "packages/supabase/src/server.ts",
  "apps/admin/lib/auth/authorization.ts",
  "apps/admin/lib/auth/api.ts",
]) {
  const content = await readFile(path.join(repositoryRoot, serverOnlyModule), "utf8");
  assert.match(content, /import ["']server-only["'];/);
}

process.stdout.write(
  "Browser bundles contain no privileged credentials or server configuration.\n",
);
