import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const files = [
  "docs/authentication/authentication-flow.mmd",
  "docs/authentication/authentication-flow.dot",
  "docs/authentication/authentication-flow.svg",
  "docs/authentication/authentication-flow.md",
];

async function snapshot() {
  return new Map(
    await Promise.all(
      files.map(async (file) => [file, await readFile(path.join(repositoryRoot, file), "utf8")]),
    ),
  );
}

const before = await snapshot();
await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ["scripts/auth/generate-diagram.mjs"], {
    cwd: repositoryRoot,
    stdio: "inherit",
  });
  child.once("error", reject);
  child.once("exit", (code) =>
    code === 0 ? resolve() : reject(new Error(`Auth diagram generator exited with ${code}`)),
  );
});
const after = await snapshot();
const stale = files.filter((file) => before.get(file) !== after.get(file));
assert.deepEqual(stale, [], `Generated authentication artifacts were stale: ${stale.join(", ")}`);
process.stdout.write("Generated authentication artifacts are synchronized.\n");
