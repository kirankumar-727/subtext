import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const files = [
  "docs/cms/writer-workspace-flow.mmd",
  "docs/cms/writer-workspace-flow.dot",
  "docs/cms/writer-workspace-flow.svg",
  "docs/cms/writer-workspace-flow.md",
];
const snap = async () =>
  new Map(
    await Promise.all(files.map(async (f) => [f, await readFile(path.join(root, f), "utf8")])),
  );
const before = await snap();
await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ["scripts/cms/generate-diagram.mjs"], {
    cwd: root,
    stdio: "inherit",
  });
  child.on("error", reject);
  child.on("exit", (code) =>
    code === 0 ? resolve() : reject(new Error(`generator exited ${code}`)),
  );
});
const after = await snap();
assert.deepEqual(
  files.filter((f) => before.get(f) !== after.get(f)),
  [],
);
console.log("Writer Workspace artifacts are synchronized.");
