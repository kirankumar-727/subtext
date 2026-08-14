import { describe, expect, it } from "vitest";

import {
  evaluateAdminAuthorization,
  type AuthClaims,
  type AuthClientLike,
  type VerifiedUser,
} from "@/lib/auth/authorization-core";

const founderEmail = "founder@subtext.media";
const userId = "60000000-0000-4000-8000-000000000001";

const founderClaims: AuthClaims = {
  sub: userId,
  email: founderEmail,
  user_role: "admin",
  is_anonymous: false,
  app_metadata: { provider: "google", providers: ["google"] },
};

const founderUser: VerifiedUser = {
  id: userId,
  email: founderEmail,
  email_confirmed_at: "2026-08-08T00:00:00.000Z",
  is_anonymous: false,
  app_metadata: { provider: "google", providers: ["google"] },
};

function authClient(options?: {
  claims?: AuthClaims | null;
  claimsError?: unknown;
  user?: VerifiedUser | null;
  userError?: unknown;
}): AuthClientLike {
  return {
    auth: {
      async getClaims() {
        return {
          data: { claims: options?.claims === undefined ? founderClaims : options.claims },
          error: options?.claimsError ?? null,
        };
      },
      async getUser() {
        return {
          data: { user: options?.user === undefined ? founderUser : options.user },
          error: options?.userError ?? null,
        };
      },
    },
  };
}

describe("evaluateAdminAuthorization", () => {
  it("authorizes the verified founder Google identity", async () => {
    await expect(evaluateAdminAuthorization(authClient(), founderEmail)).resolves.toEqual({
      status: "authorized",
      admin: { userId },
    });
  });

  it("rejects an unauthenticated visitor", async () => {
    await expect(
      evaluateAdminAuthorization(authClient({ claims: null }), founderEmail),
    ).resolves.toEqual({ status: "unauthenticated", reason: "missing_claims" });
  });

  it("rejects an expired or invalid server session", async () => {
    await expect(
      evaluateAdminAuthorization(
        authClient({ user: null, userError: new Error("expired") }),
        founderEmail,
      ),
    ).resolves.toEqual({ status: "unauthenticated", reason: "invalid_session" });
  });

  it("rejects a valid but unauthorized Google account", async () => {
    const email = "someone-else@example.com";
    await expect(
      evaluateAdminAuthorization(
        authClient({
          claims: { ...founderClaims, email, user_role: null },
          user: { ...founderUser, email },
        }),
        founderEmail,
      ),
    ).resolves.toMatchObject({ status: "unauthorized" });
  });

  it("rejects a non-Google identity even when the email matches", async () => {
    await expect(
      evaluateAdminAuthorization(
        authClient({
          claims: {
            ...founderClaims,
            app_metadata: { provider: "github", providers: ["github"] },
          },
          user: {
            ...founderUser,
            app_metadata: { provider: "github", providers: ["github"] },
          },
        }),
        founderEmail,
      ),
    ).resolves.toEqual({ status: "unauthorized", reason: "wrong_provider" });
  });

  it("rejects a matching identity without the server-issued admin claim", async () => {
    await expect(
      evaluateAdminAuthorization(
        authClient({ claims: { ...founderClaims, user_role: null } }),
        founderEmail,
      ),
    ).resolves.toEqual({ status: "unauthorized", reason: "missing_admin_claim" });
  });

  it("rejects an unverified email", async () => {
    await expect(
      evaluateAdminAuthorization(
        authClient({ user: { ...founderUser, email_confirmed_at: null } }),
        founderEmail,
      ),
    ).resolves.toEqual({ status: "unauthorized", reason: "unverified_email" });
  });
});
