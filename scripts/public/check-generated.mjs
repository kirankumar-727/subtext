import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const names = ["public-website-architecture", "public-content-rendering-flow", "public-route-map"];
const files = names.flatMap((n) => ["mmd", "dot", "svg", "md"].map((e) => `docs/public/${n}.${e}`));
const snap = async () =>
  new Map(
    await Promise.all(files.map(async (f) => [f, await readFile(path.join(root, f), "utf8")])),
  );
const before = await snap();
await new Promise((resolve, reject) => {
  const c = spawn(process.execPath, ["scripts/public/generate-diagrams.mjs"], {
    cwd: root,
    stdio: "inherit",
  });
  c.on("error", reject);
  c.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`generator exited ${code}`))));
});
const after = await snap();
assert.deepEqual(
  files.filter((f) => before.get(f) !== after.get(f)),
  [],
);
console.log("Public website diagrams are synchronized.");
