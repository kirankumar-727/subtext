import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { repositoryRoot } from "./schema-runtime.mjs";

const generatedFiles = [
  "packages/supabase/src/database.types.ts",
  "docs/database/er-diagram.mmd",
  "docs/database/er-diagram.dot",
  "docs/database/er-diagram.svg",
  "docs/database/er-diagram.md",
  "docs/database/dependency-graph.mmd",
  "docs/database/dependency-graph.dot",
  "docs/database/dependency-graph.svg",
  "docs/database/dependency-graph.md",
  "docs/database/schema-reference.md",
  "docs/database/schema.snapshot.json",
];

async function snapshotFiles() {
  return new Map(
    await Promise.all(
      generatedFiles.map(async (relativePath) => [
        relativePath,
        await readFile(path.join(repositoryRoot, relativePath), "utf8"),
      ]),
    ),
  );
}

function runGenerator() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/database/generate-artifacts.mjs"], {
      cwd: repositoryRoot,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Artifact generator exited with code ${code}`));
    });
  });
}

const before = await snapshotFiles();
await runGenerator();
const after = await snapshotFiles();

const staleFiles = generatedFiles.filter(
  (relativePath) => before.get(relativePath) !== after.get(relativePath),
);
assert.deepEqual(
  staleFiles,
  [],
  `Generated database artifacts were stale: ${staleFiles.join(", ")}. Commit regenerated output.`,
);

process.stdout.write("Generated database types and documentation are synchronized.\n");
