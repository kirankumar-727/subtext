import assert from "node:assert/strict";
import { validateEnvironment } from "./environment-contract.mjs";
const publicEnv = {
  NEXT_PUBLIC_SITE_URL: "https://subtext.media",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_12345678901234567890",
  REVALIDATION_SECRET: "r".repeat(32),
  PUBLISHING_WORKER_SECRET: "w".repeat(32),
  CRON_SECRET: "c".repeat(32),
};
assert.deepEqual(validateEnvironment("public", publicEnv), []);
assert.ok(validateEnvironment("public", { ...publicEnv, REVALIDATION_SECRET: "short" }).length);
assert.ok(
  validateEnvironment("public", { ...publicEnv, NEXT_PUBLIC_SECRET_TOKEN: "leak" }).some((error) =>
    error.includes("must not be public"),
  ),
);
console.log("Production environment fail-closed contract tests passed.");
