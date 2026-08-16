import { decideBeforeUserCreated, decideCustomAccessToken } from "./founder-policy.ts";
import { verifyAuthHook } from "./http.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

async function signedRequest(payload: string, secret: Uint8Array) {
  const webhookId = "msg_subtext_auth_test";
  const webhookTimestamp = Math.floor(Date.now() / 1000).toString();
  const signedContent = `${webhookId}.${webhookTimestamp}.${payload}`;

  const rawKey = secret.buffer.slice(
    secret.byteOffset,
    secret.byteOffset + secret.byteLength,
  ) as ArrayBuffer;

  const key = await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(signedContent),
    ),
  );

  return new Request("http://localhost/auth-hook", {
    method: "POST",
    body: payload,
    headers: {
      "content-type": "application/json",
      "webhook-id": webhookId,
      "webhook-timestamp": webhookTimestamp,
      "webhook-signature": `v1,${bytesToBase64(signature)}`,
    },
  });
}

Deno.test("signed Auth hook payload verifies before policy evaluation", async () => {
  const secret = crypto.getRandomValues(new Uint8Array(32));

  Deno.env.set(
    "TEST_AUTH_HOOK_SECRET",
    `v1,whsec_${bytesToBase64(secret)}`,
  );

  const payload = JSON.stringify({
    user: { email: "founder@subtext.media" },
  });

  const request = await signedRequest(payload, secret);

  const verified = verifyAuthHook<{ user: { email: string } }>(
    request,
    payload,
    "TEST_AUTH_HOOK_SECRET",
  );

  assertEquals(verified.user.email, "founder@subtext.media");
});

Deno.test("invalid Auth hook signature is rejected", async () => {
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const wrongSecret = crypto.getRandomValues(new Uint8Array(32));

  Deno.env.set(
    "TEST_AUTH_HOOK_SECRET",
    `v1,whsec_${bytesToBase64(secret)}`,
  );

  const payload = JSON.stringify({
    user: { email: "founder@subtext.media" },
  });

  const request = await signedRequest(payload, wrongSecret);

  let rejected = false;

  try {
    verifyAuthHook(request, payload, "TEST_AUTH_HOOK_SECRET");
  } catch {
    rejected = true;
  }

  assertEquals(rejected, true);
});

Deno.test("founder policy admits GitHub founder and grants admin claim", () => {
  const founderEmail = "founder@subtext.media";

  const app_metadata = {
    provider: "github",
    providers: ["github"],
  };

  assertEquals(
    decideBeforeUserCreated(
      {
        user: {
          email: founderEmail,
          app_metadata,
        },
      },
      founderEmail,
    ),
    {},
  );

  assertEquals(
    decideCustomAccessToken(
      {
        claims: {
          email: founderEmail,
          app_metadata,
          role: "authenticated",
        },
      },
      founderEmail,
    ).claims.user_role,
    "admin",
  );
});