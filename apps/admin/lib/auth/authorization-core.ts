export type AuthClaims = Record<string, unknown> & {
  sub?: string;
  email?: string;
  user_role?: string | null;
  is_anonymous?: boolean;
  app_metadata?: {
    provider?: string;
    providers?: string[];
  };
};

export type VerifiedUser = {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  is_anonymous?: boolean;
  app_metadata?: {
    provider?: string;
    providers?: string[];
  };
};

export type AuthClientLike = {
  auth: {
    getClaims(): Promise<{
      data: { claims?: AuthClaims | null } | null;
      error: unknown;
    }>;
    getUser(): Promise<{
      data: { user?: VerifiedUser | null };
      error: unknown;
    }>;
  };
};

export type AdminAuthorization =
  | {
      status: "authorized";
      admin: { userId: string };
    }
  | {
      status: "unauthenticated";
      reason: "missing_claims" | "invalid_session";
    }
  | {
      status: "unauthorized";
      reason:
        | "identity_mismatch"
        | "unverified_email"
        | "wrong_provider"
        | "missing_admin_claim";
    };

export function normalizeEmail(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLocaleLowerCase("en-US")
    : "";
}

function hasOnlyGitHubIdentity(user: VerifiedUser): boolean {
  const provider = user.app_metadata?.provider;
  const providers =
    user.app_metadata?.providers ?? (provider ? [provider] : []);

  return (
    provider === "github" &&
    providers.length === 1 &&
    providers[0] === "github"
  );
}

export async function evaluateAdminAuthorization(
  client: AuthClientLike,
  founderEmail: string,
): Promise<AdminAuthorization> {
  const claimsResult = await client.auth.getClaims();
  const claims = claimsResult.error ? null : claimsResult.data?.claims;

  if (!claims?.sub) {
    return { status: "unauthenticated", reason: "missing_claims" };
  }

  const userResult = await client.auth.getUser();
  const user = userResult.error ? null : userResult.data.user;

  if (!user) {
    return { status: "unauthenticated", reason: "invalid_session" };
  }

  const expectedEmail = normalizeEmail(founderEmail);
  const verifiedEmail = normalizeEmail(user.email);
  const claimEmail = normalizeEmail(claims.email);

  if (
    !expectedEmail ||
    verifiedEmail !== expectedEmail ||
    claimEmail !== expectedEmail ||
    user.id !== claims.sub ||
    user.is_anonymous ||
    claims.is_anonymous
  ) {
    return { status: "unauthorized", reason: "identity_mismatch" };
  }

  if (!user.email_confirmed_at) {
    return { status: "unauthorized", reason: "unverified_email" };
  }

  if (!hasOnlyGitHubIdentity(user)) {
    return { status: "unauthorized", reason: "wrong_provider" };
  }

  if (claims.user_role !== "admin") {
    return { status: "unauthorized", reason: "missing_admin_claim" };
  }

  return {
    status: "authorized",
    admin: { userId: user.id },
  };
}