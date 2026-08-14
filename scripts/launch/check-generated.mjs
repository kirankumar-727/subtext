import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const files = [
  "docs/launch/final-platform-architecture.mmd",
  "docs/launch/final-platform-architecture.dot",
  "docs/launch/final-platform-architecture.svg",
  "docs/launch/final-platform-architecture.md",
  "docs/launch/environment-configuration-checklist.md",
];
const snap = async () =>
  new Map(
    await Promise.all(
      files.map(async (file) => [file, await readFile(path.join(root, file), "utf8")]),
    ),
  );
const before = await snap();
await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ["scripts/launch/generate-artifacts.mjs"], {
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
  files.filter((file) => before.get(file) !== after.get(file)),
  [],
);
console.log("Launch artifacts are synchronized.");
