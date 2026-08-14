import { describe, expect, it } from "vitest";

import { parsePublicEnvironment } from "./public";

const validEnvironment = {
  NEXT_PUBLIC_SITE_URL: "https://subtext.media",
  NEXT_PUBLIC_ADMIN_URL: "https://admin.subtext.media",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_1234567890",
};

describe("parsePublicEnvironment", () => {
  it("accepts the Subtext public environment contract", () => {
    expect(parsePublicEnvironment(validEnvironment)).toEqual(validEnvironment);
  });

  it("rejects missing Supabase configuration", () => {
    const { NEXT_PUBLIC_SUPABASE_URL: _, ...incompleteEnvironment } = validEnvironment;

    expect(() => parsePublicEnvironment(incompleteEnvironment)).toThrow();
  });
});
