import { isVariantUuid, matchesSecret, PUBLIC_MEDIA_SIGNED_URL_SECONDS } from "./media-delivery.ts";

Deno.test("public media signer accepts only UUID variant identifiers", () => {
  if (!isVariantUuid("90000000-0000-4000-8000-000000000001"))
    throw new Error("valid UUID rejected");
  for (const value of [null, "not-a-uuid", "../secret", "90000000-0000-4000-8000-000000000001/x"]) {
    if (isVariantUuid(value)) throw new Error(`invalid variant accepted: ${value}`);
  }
});

Deno.test("public media signer compares the complete shared secret", () => {
  if (!matchesSecret("media-secret", "media-secret")) throw new Error("secret rejected");
  if (matchesSecret("media-secret", "media-secret-2")) throw new Error("longer secret accepted");
  if (matchesSecret("media-secret", "media-secreu")) throw new Error("wrong secret accepted");
  if (matchesSecret("media-secret", null)) throw new Error("missing secret accepted");
});

Deno.test("public media signed URLs are short-lived", () => {
  if (PUBLIC_MEDIA_SIGNED_URL_SECONDS > 600) throw new Error("signed URL lifetime is too long");
});
