import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  worker: "supabase/functions/publishing-worker/index.ts",
  coordinator: "apps/public/app/api/internal/publication/route.ts",
  cron: "apps/public/app/api/internal/publishing-tick/route.ts",
  dispatch: "apps/admin/lib/publishing/dispatch.ts",
};
for (const [name, file] of Object.entries(files)) {
  const content = await readFile(file, "utf8");
  if (name === "worker") assert.match(content, /workerAuthorized/);
  if (name === "coordinator") assert.match(content, /REVALIDATION_SECRET/);
  if (name === "cron") assert.match(content, /CRON_SECRET/);
  if (name === "dispatch") assert.match(content, /PUBLISHING_WORKER_SECRET/);
  assert.doesNotMatch(content, /sb_secret_[A-Za-z0-9_-]{8,}/);
}
process.stdout.write(
  "Publishing worker, coordinator, cron, and dispatch secret boundaries are enforced.\n",
);
