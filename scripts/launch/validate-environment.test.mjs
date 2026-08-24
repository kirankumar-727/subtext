import assert from "node:assert/strict";
import { validateEnvironment } from "./environment-contract.mjs";

const publicProductionEnv = {
  SUBTEXT_ENVIRONMENT: "production",
  NEXT_PUBLIC_SITE_URL: "https://subtext.media",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_12345678901234567890",
  REVALIDATION_SECRET: "r".repeat(32),
  PUBLISHING_WORKER_SECRET: "w".repeat(32),
  CRON_SECRET: "c".repeat(32),
};
assert.deepEqual(validateEnvironment("public", publicProductionEnv), []);
assert.ok(
  validateEnvironment("public", { ...publicProductionEnv, REVALIDATION_SECRET: "short" }).length,
);
assert.ok(
  validateEnvironment("public", { ...publicProductionEnv, NEXT_PUBLIC_SECRET_TOKEN: "leak" }).some(
    (error) => error.includes("must not be public"),
  ),
);

const adminProductionEnv = {
  SUBTEXT_ENVIRONMENT: "production",
  NEXT_PUBLIC_SITE_URL: "https://subtext.media",
  NEXT_PUBLIC_ADMIN_URL: "https://admin.subtext.media",
  NEXT_PUBLIC_SUPABASE_URL: publicProductionEnv.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicProductionEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: "sb_secret_" + "s".repeat(32),
  FOUNDER_EMAIL: "admin@example.test",
  PUBLISHING_WORKER_SECRET: "a".repeat(32),
};
assert.deepEqual(validateEnvironment("admin", adminProductionEnv), []);
assert.ok(
  validateEnvironment("admin", { ...adminProductionEnv, SUPABASE_SECRET_KEY: undefined }).some(
    (error) => error.includes("SUPABASE_SECRET_KEY: missing"),
  ),
);

const operatorProductionEnv = {
  SUBTEXT_ENVIRONMENT: "production",
  SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
  SUPABASE_ACCESS_TOKEN: "operator-token-value-that-is-long-enough",
  SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID: "github-client-123",
  SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET: "g".repeat(32),
  BEFORE_USER_CREATED_HOOK_SECRET: "v1,whsec_" + "b".repeat(24),
  CUSTOM_ACCESS_TOKEN_HOOK_SECRET: "v1,whsec_" + "d".repeat(24),
  NEXT_PUBLIC_ADMIN_URL: "https://admin.subtext.media",
  NEXT_PUBLIC_SUPABASE_URL: publicProductionEnv.NEXT_PUBLIC_SUPABASE_URL,
};
assert.deepEqual(validateEnvironment("operator", operatorProductionEnv), []);
assert.ok(
  validateEnvironment("operator", {
    ...operatorProductionEnv,
    SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID: undefined,
    SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID: "legacy-google-client",
  }).some((error) => error.includes("SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID: missing")),
);

const functionProductionEnv = {
  SUBTEXT_ENVIRONMENT: "production",
  SUPABASE_URL: publicProductionEnv.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SECRET_KEYS: JSON.stringify({ default: "sb_secret_" + "f".repeat(32) }),
  FOUNDER_EMAIL: "admin@example.test",
  BEFORE_USER_CREATED_HOOK_SECRET: "v1,whsec_" + "b".repeat(24),
  CUSTOM_ACCESS_TOKEN_HOOK_SECRET: "v1,whsec_" + "d".repeat(24),
  PUBLISHING_WORKER_SECRET: "w".repeat(32),
  PUBLICATION_API_URL: "https://subtext.media",
  REVALIDATION_SECRET: "r".repeat(32),
};
assert.deepEqual(validateEnvironment("supabase-functions", functionProductionEnv), []);

const publicStagingEnv = {
  ...publicProductionEnv,
  SUBTEXT_ENVIRONMENT: "staging",
  NEXT_PUBLIC_SITE_URL: "https://subtext-public-staging.vercel.app",
};
assert.deepEqual(validateEnvironment("public", publicStagingEnv), []);

const adminStagingEnv = {
  ...adminProductionEnv,
  SUBTEXT_ENVIRONMENT: "staging",
  NEXT_PUBLIC_SITE_URL: publicStagingEnv.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_ADMIN_URL: "https://subtext-admin-staging.vercel.app",
};
assert.deepEqual(validateEnvironment("admin", adminStagingEnv), []);

const functionStagingEnv = {
  ...functionProductionEnv,
  SUBTEXT_ENVIRONMENT: "staging",
  PUBLICATION_API_URL: publicStagingEnv.NEXT_PUBLIC_SITE_URL,
};
assert.deepEqual(validateEnvironment("supabase-functions", functionStagingEnv), []);

const operatorStagingEnv = {
  ...operatorProductionEnv,
  SUBTEXT_ENVIRONMENT: "staging",
  NEXT_PUBLIC_ADMIN_URL: adminStagingEnv.NEXT_PUBLIC_ADMIN_URL,
};
assert.deepEqual(validateEnvironment("operator", operatorStagingEnv), []);

assert.ok(
  validateEnvironment("public", {
    ...publicStagingEnv,
    NEXT_PUBLIC_SITE_URL: "https://staging.example.com",
  }).some((error) => error.includes("staging requires an HTTPS *.vercel.app origin")),
);
assert.ok(
  validateEnvironment("admin", {
    ...adminStagingEnv,
    NEXT_PUBLIC_ADMIN_URL: "https://subtext-admin-staging.vercel.app.evil.example",
  }).some((error) => error.includes("staging requires an HTTPS *.vercel.app origin")),
);
assert.ok(
  validateEnvironment("public", {
    ...publicStagingEnv,
    NEXT_PUBLIC_SITE_URL: "https://subtext.media",
  }).some((error) => error.includes("staging requires an HTTPS *.vercel.app origin")),
);
assert.ok(
  validateEnvironment("admin", {
    ...adminStagingEnv,
    NEXT_PUBLIC_ADMIN_URL: "https://admin.subtext.media",
  }).some((error) => error.includes("staging requires an HTTPS *.vercel.app origin")),
);
assert.ok(
  validateEnvironment("supabase-functions", {
    ...functionStagingEnv,
    PUBLICATION_API_URL: "https://subtext.media",
  }).some((error) => error.includes("staging requires an HTTPS *.vercel.app origin")),
);
assert.ok(
  validateEnvironment("public", {
    ...publicProductionEnv,
    NEXT_PUBLIC_SITE_URL: publicStagingEnv.NEXT_PUBLIC_SITE_URL,
  }).some((error) => error.includes("expected https://subtext.media")),
);
assert.ok(
  validateEnvironment("admin", {
    ...adminProductionEnv,
    NEXT_PUBLIC_SITE_URL: publicStagingEnv.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_ADMIN_URL: adminStagingEnv.NEXT_PUBLIC_ADMIN_URL,
  }).some((error) => error.includes("expected https://subtext.media")),
);

assert.ok(
  validateEnvironment("public", { ...publicStagingEnv, SUBTEXT_ENVIRONMENT: undefined }).some(
    (error) => error.includes("SUBTEXT_ENVIRONMENT: missing"),
  ),
);
assert.ok(
  validateEnvironment("public", { ...publicStagingEnv, SUBTEXT_ENVIRONMENT: "preview" }).some(
    (error) => error.includes("SUBTEXT_ENVIRONMENT: invalid value"),
  ),
);
assert.ok(
  validateEnvironment("admin", { ...adminStagingEnv, SUPABASE_SECRET_KEY: undefined }).some(
    (error) => error.includes("SUPABASE_SECRET_KEY: missing"),
  ),
);
assert.ok(
  validateEnvironment("public", { ...publicStagingEnv, CRON_SECRET: "short" }).some((error) =>
    error.includes("CRON_SECRET: minimum 32 characters"),
  ),
);

console.log("Environment contract tests passed for explicit production and staging modes.");
