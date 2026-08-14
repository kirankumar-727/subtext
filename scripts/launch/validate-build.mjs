import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? filesBelow(path.join(directory, entry.name))
          : [path.join(directory, entry.name)],
      ),
    )
  ).flat();
}
const staticRoot = "apps/public/.next/static";
const files = await filesBelow(staticRoot);
const scripts = files.filter((file) => file.endsWith(".js"));
const styles = files.filter((file) => file.endsWith(".css"));
const gzipBytes = (
  await Promise.all(scripts.map(async (file) => gzipSync(await readFile(file)).byteLength))
).reduce((sum, size) => sum + size, 0);
const cssBytes = (
  await Promise.all(styles.map(async (file) => (await readFile(file)).byteLength))
).reduce((sum, size) => sum + size, 0);
assert.ok(
  gzipBytes < 500_000,
  `Public browser JavaScript exceeds 500 KB gzip budget: ${gzipBytes}`,
);
assert.ok(cssBytes < 150_000, `Public CSS exceeds 150 KB budget: ${cssBytes}`);
const publicSource = await filesBelow("apps/public");
const clientModules = [];
for (const file of publicSource.filter(
  (file) =>
    /\.[jt]sx?$/.test(file) && !file.includes("/.next/") && !file.includes("/node_modules/"),
)) {
  const content = await readFile(file, "utf8");
  if (/^["']use client["'];/m.test(content)) clientModules.push(file);
}
assert.deepEqual(
  clientModules,
  ["apps/public/app/error.tsx"],
  "Unexpected public client components added",
);
console.log(
  `Public build budget passed: ${Math.round(gzipBytes / 1024)} KB gzip JavaScript, ${Math.round(cssBytes / 1024)} KB CSS, ${clientModules.length} client module.`,
);
