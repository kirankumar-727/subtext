import { describe, expect, it } from "vitest";

import {
  decideBeforeUserCreated,
  decideCustomAccessToken,
} from "../../../supabase/functions/_shared/founder-policy";

const founderEmail = "founder@subtext.media";

const githubMetadata = {
  provider: "github",
  providers: ["github"],
};

describe("before-user-created founder admission hook", () => {
  it("admits only the exact founder GitHub identity", () => {
    expect(
      decideBeforeUserCreated(
        {
          user: {
            email: founderEmail,
            app_metadata: githubMetadata,
          },
        },
        founderEmail,
      ),
    ).toEqual({});
  });

  it("compares email case-insensitively without alias rewriting", () => {
    expect(
      decideBeforeUserCreated(
        {
          user: {
            email: " Founder@Subtext.Media ",
            app_metadata: githubMetadata,
          },
        },
        founderEmail,
      ),
    ).toEqual({});
  });

  it("rejects every other GitHub account", () => {
    expect(
      decideBeforeUserCreated(
        {
          user: {
            email: "other@example.com",
            app_metadata: githubMetadata,
          },
        },
        founderEmail,
      ),
    ).toEqual({
      error: {
        http_code: 403,
        message: "Access denied.",
      },
    });
  });

  it("rejects non-GitHub and missing providers", () => {
    expect(
      decideBeforeUserCreated(
        {
          user: {
            email: founderEmail,
            app_metadata: {
              provider: "google",
              providers: ["google"],
            },
          },
        },
        founderEmail,
      ),
    ).toHaveProperty("error.http_code", 403);

    expect(
      decideBeforeUserCreated(
        {
          user: {
            email: founderEmail,
          },
        },
        founderEmail,
      ),
    ).toHaveProperty("error.http_code", 403);
  });
});

describe("custom access-token founder claim hook", () => {
  it("adds the admin RLS claim only to the founder GitHub token", () => {
    const result = decideCustomAccessToken(
      {
        user_id: "founder-id",
        claims: {
          email: founderEmail,
          app_metadata: githubMetadata,
          role: "authenticated",
        },
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
          app_metadata: githubMetadata,
          user_role: "admin",
        },
      },
      founderEmail,
    );

    expect(result.claims.user_role).toBeNull();
  });
});