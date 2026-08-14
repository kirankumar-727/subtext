import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const names = ["publishing-engine-flow", "publication-job-state-machine", "failure-retry-flow"];
const files = names.flatMap((name) =>
  ["mmd", "dot", "svg", "md"].map((ext) => `docs/publishing/${name}.${ext}`),
);
const snap = async () =>
  new Map(
    await Promise.all(files.map(async (f) => [f, await readFile(path.join(root, f), "utf8")])),
  );
const before = await snap();
await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ["scripts/publishing/generate-diagrams.mjs"], {
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
console.log("Publishing diagrams are synchronized.");
