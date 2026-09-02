import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => readFile(path.join(root, file), "utf8");

const envExample = await read(".env.example");
assert.match(envExample, /SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID=/);
assert.match(envExample, /SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET=/);
assert.doesNotMatch(envExample, /SUPABASE_AUTH_EXTERNAL_GOOGLE/);

const supabaseConfig = await read("supabase/config.toml");
assert.match(supabaseConfig, /\[auth\.external\.github\][\s\S]*enabled = true/);
assert.match(supabaseConfig, /env\(SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID\)/);
assert.match(supabaseConfig, /env\(SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET\)/);
assert.doesNotMatch(supabaseConfig, /\[auth\.external\.google\]/);

const configureScript = await read("scripts/auth/configure-supabase-auth.mjs");
assert.match(configureScript, /external_google_enabled: false/);
assert.match(configureScript, /external_github_enabled: true/);
assert.match(configureScript, /SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID/);
assert.match(configureScript, /SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET/);
assert.doesNotMatch(
  configureScript,
  /external_google_enabled:\s*true|SUPABASE_AUTH_EXTERNAL_GOOGLE/,
);

const bundleVerifier = await read("scripts/auth/verify-client-bundles.mjs");
assert.match(bundleVerifier, /SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET/);
assert.doesNotMatch(bundleVerifier, /SUPABASE_AUTH_EXTERNAL_GOOGLE/);

const environmentContract = await read("scripts/launch/environment-contract.mjs");
assert.match(environmentContract, /SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID/);
assert.match(environmentContract, /kind: "github-client"/);
assert.doesNotMatch(environmentContract, /SUPABASE_AUTH_EXTERNAL_GOOGLE|google-client/);

const turbo = JSON.parse(await read("turbo.json"));
for (const name of [
  "SUPABASE_SECRET_KEY",
  "FOUNDER_EMAIL",
  "PUBLISHING_SIGNING_SECRET",
  "PUBLISHING_WORKER_SECRET",
  "REVALIDATION_SECRET",
  "CRON_SECRET",
]) {
  assert.ok(turbo.globalPassThroughEnv.includes(name), `${name} must be pass-through only`);
  assert.equal(
    turbo.globalEnv.includes(name),
    false,
    `${name} must not affect cache keys globally`,
  );
}

await access(path.join(root, "docs/authentication/github-oauth-setup.md"));
await assert.rejects(access(path.join(root, "docs/authentication/google-oauth-setup.md")));

console.log("GitHub-only authentication configuration contract tests passed.");
