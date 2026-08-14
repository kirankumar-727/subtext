import { describe, expect, it } from "vitest";

import { parseServerEnvironment } from "./server";

const validEnvironment = {
  NEXT_PUBLIC_SITE_URL: "https://subtext.media",
  NEXT_PUBLIC_ADMIN_URL: "https://admin.subtext.media",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_1234567890",
  SUPABASE_SECRET_KEY: "sb_secret_12345678901234567890",
  FOUNDER_EMAIL: "founder@subtext.media",
  PUBLISHING_SIGNING_SECRET: "p".repeat(32),
  REVALIDATION_SECRET: "r".repeat(32),
  CRON_SECRET: "c".repeat(32),
};

describe("parseServerEnvironment", () => {
  it("accepts valid server-only values", () => {
    expect(parseServerEnvironment(validEnvironment)).toEqual(validEnvironment);
  });

  it("rejects a weak publishing secret", () => {
    expect(() =>
      parseServerEnvironment({
        ...validEnvironment,
        PUBLISHING_SIGNING_SECRET: "too-short",
      }),
    ).toThrow();
  });
});
