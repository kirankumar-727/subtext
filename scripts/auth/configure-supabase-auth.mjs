import assert from "node:assert/strict";

function required(name) {
  const value = process.env[name]?.trim();
  assert.ok(value, `Missing required environment variable: ${name}`);
  return value;
}

const projectRef = required("SUPABASE_PROJECT_REF");
const accessToken = required("SUPABASE_ACCESS_TOKEN");
const adminUrl = new URL(required("NEXT_PUBLIC_ADMIN_URL"));
const supabaseUrl = new URL(required("NEXT_PUBLIC_SUPABASE_URL"));
const beforeUserSecret = required("BEFORE_USER_CREATED_HOOK_SECRET");
const customTokenSecret = required("CUSTOM_ACCESS_TOKEN_HOOK_SECRET");

assert.equal(adminUrl.protocol, "https:", "Production Admin URL must use HTTPS");
assert.match(beforeUserSecret, /^v1,whsec_[A-Za-z0-9+/=_-]+$/);
assert.match(customTokenSecret, /^v1,whsec_[A-Za-z0-9+/=_-]+$/);
assert.notEqual(beforeUserSecret, customTokenSecret, "Auth hooks require independent secrets");

const configuration = {
  site_url: adminUrl.origin,
  uri_allow_list: new URL("/auth/callback", adminUrl).toString(),
  external_email_enabled: false,
  external_phone_enabled: false,
  external_anonymous_users_enabled: false,
  external_google_enabled: false,
  external_github_enabled: true,
  external_github_client_id: required("SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID"),
  external_github_secret: required("SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET"),
  hook_before_user_created_enabled: true,
  hook_before_user_created_uri: new URL(
    "/functions/v1/before-user-created",
    supabaseUrl,
  ).toString(),
  hook_before_user_created_secrets: beforeUserSecret,
  hook_custom_access_token_enabled: true,
  hook_custom_access_token_uri: new URL(
    "/functions/v1/custom-access-token",
    supabaseUrl,
  ).toString(),
  hook_custom_access_token_secrets: customTokenSecret,
};

if (!process.argv.includes("--apply")) {
  process.stdout.write(
    "Auth configuration validated. Re-run with --apply to update the linked Supabase project.\n",
  );
  process.exit(0);
}

const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/auth`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(configuration),
});

if (!response.ok) {
  const detail = await response.text();
  throw new Error(`Supabase Auth configuration failed (${response.status}): ${detail}`);
}

process.stdout.write("Supabase GitHub provider and signed Auth hooks configured successfully.\n");
