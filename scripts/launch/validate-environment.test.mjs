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

const adminEnv = {
  NEXT_PUBLIC_SITE_URL: "https://subtext.media",
  NEXT_PUBLIC_ADMIN_URL: "https://admin.subtext.media",
  NEXT_PUBLIC_SUPABASE_URL: publicEnv.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: "sb_secret_" + "s".repeat(32),
  FOUNDER_EMAIL: "admin@example.test",
  PUBLISHING_WORKER_SECRET: "a".repeat(32),
};
assert.deepEqual(validateEnvironment("admin", adminEnv), []);
assert.ok(
  validateEnvironment("admin", { ...adminEnv, SUPABASE_SECRET_KEY: undefined }).some((error) =>
    error.includes("SUPABASE_SECRET_KEY: missing"),
  ),
);

const operatorEnv = {
  SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
  SUPABASE_ACCESS_TOKEN: "operator-token-value-that-is-long-enough",
  SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID: "github-client-123",
  SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET: "g".repeat(32),
  BEFORE_USER_CREATED_HOOK_SECRET: "v1,whsec_" + "b".repeat(24),
  CUSTOM_ACCESS_TOKEN_HOOK_SECRET: "v1,whsec_" + "d".repeat(24),
  NEXT_PUBLIC_ADMIN_URL: "https://admin.subtext.media",
  NEXT_PUBLIC_SUPABASE_URL: publicEnv.NEXT_PUBLIC_SUPABASE_URL,
};
assert.deepEqual(validateEnvironment("operator", operatorEnv), []);
assert.ok(
  validateEnvironment("operator", {
    ...operatorEnv,
    SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID: undefined,
    SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID: "legacy-google-client",
  }).some((error) => error.includes("SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID: missing")),
);

console.log("Production environment fail-closed contract tests passed.");
