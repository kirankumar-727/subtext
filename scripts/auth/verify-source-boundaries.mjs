import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory() && [".next", "coverage", "node_modules"].includes(entry.name)) {
        return [];
      }
      return entry.isDirectory() ? filesBelow(target) : [target];
    }),
  );
  return nested.flat();
}

const adminAppDirectory = path.join(repositoryRoot, "apps/admin");
const sourceFiles = (await filesBelow(adminAppDirectory)).filter((file) =>
  /\.[cm]?[jt]sx?$/.test(file),
);

for (const file of sourceFiles) {
  const relativePath = path.relative(repositoryRoot, file);
  const content = await readFile(file, "utf8");

  if (/apps\/admin\/app\/api\/.+\/route\.ts$/.test(relativePath)) {
    assert.match(
      content,
      /withAdminApi/,
      `Protected API route lacks withAdminApi: ${relativePath}`,
    );
  }

  if (/apps\/admin\/app\/admin\/(?:.*\/)?actions\.ts$/.test(relativePath)) {
    assert.match(
      content,
      /requireAdmin/,
      `Privileged server action lacks requireAdmin: ${relativePath}`,
    );
  }

  if (content.includes("@subtext/supabase/admin")) {
    assert.equal(
      relativePath,
      "apps/admin/lib/auth/authorization.ts",
      `Raw privileged client imported outside authorized gateway: ${relativePath}`,
    );
  }

  if (/^["']use client["'];/m.test(content)) {
    for (const marker of [
      "FOUNDER_EMAIL",
      "SUPABASE_SECRET_KEY",
      "BEFORE_USER_CREATED_HOOK_SECRET",
      "CUSTOM_ACCESS_TOKEN_HOOK_SECRET",
    ]) {
      assert.equal(
        content.includes(marker),
        false,
        `Client module references privileged configuration ${marker}: ${relativePath}`,
      );
    }
  }
}

const protectedLayout = await readFile(
  path.join(repositoryRoot, "apps/admin/app/admin/layout.tsx"),
  "utf8",
);
assert.match(protectedLayout, /requireAdminPage/);

process.stdout.write(
  "Admin route, API, action, and privileged-client source boundaries are enforced.\n",
);
