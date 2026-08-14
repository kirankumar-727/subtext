import { describe, expect, it } from "vitest";

import {
  decideBeforeUserCreated,
  decideCustomAccessToken,
} from "../../../supabase/functions/_shared/founder-policy";

const founderEmail = "founder@subtext.media";
const googleMetadata = { provider: "google", providers: ["google"] };

describe("before-user-created founder admission hook", () => {
  it("admits only the exact founder Google identity", () => {
    expect(
      decideBeforeUserCreated(
        { user: { email: founderEmail, app_metadata: googleMetadata } },
        founderEmail,
      ),
    ).toEqual({});
  });

  it("compares email case-insensitively without alias rewriting", () => {
    expect(
      decideBeforeUserCreated(
        { user: { email: " Founder@Subtext.Media ", app_metadata: googleMetadata } },
        founderEmail,
      ),
    ).toEqual({});
  });

  it("rejects every other Google account", () => {
    expect(
      decideBeforeUserCreated(
        { user: { email: "other@example.com", app_metadata: googleMetadata } },
        founderEmail,
      ),
    ).toEqual({ error: { http_code: 403, message: "Access denied." } });
  });

  it("rejects non-Google and missing providers", () => {
    expect(
      decideBeforeUserCreated(
        {
          user: {
            email: founderEmail,
            app_metadata: { provider: "github", providers: ["github"] },
          },
        },
        founderEmail,
      ),
    ).toHaveProperty("error.http_code", 403);
    expect(decideBeforeUserCreated({ user: { email: founderEmail } }, founderEmail)).toHaveProperty(
      "error.http_code",
      403,
    );
  });
});

describe("custom access-token founder claim hook", () => {
  it("adds the admin RLS claim only to the founder Google token", () => {
    const result = decideCustomAccessToken(
      {
        user_id: "founder-id",
        claims: { email: founderEmail, app_metadata: googleMetadata, role: "authenticated" },
      },
      founderEmail,
    );
    expect(result.claims.user_role).toBe("admin");
    expect(result.claims["role"]).toBe("authenticated");
  });

  it("removes the admin RLS claim from an unauthorized identity", () => {
    const result = decideCustomAccessToken(
      {
        user_id: "other-id",
        claims: {
          email: "other@example.com",
          app_metadata: googleMetadata,
          user_role: "admin",
        },
      },
      founderEmail,
    );
    expect(result.claims.user_role).toBeNull();
  });
});
