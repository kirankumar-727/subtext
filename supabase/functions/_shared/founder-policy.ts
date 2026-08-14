export type BeforeUserCreatedEvent = {
  user?: {
    email?: string;
    app_metadata?: {
      provider?: string;
      providers?: string[];
    };
  };
};

export type CustomAccessTokenEvent = {
  user_id?: string;
  claims?: Record<string, unknown> & {
    email?: string;
    app_metadata?: {
      provider?: string;
      providers?: string[];
    };
  };
  authentication_method?: string;
};

export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("en-US") : "";
}

function hasGoogleProvider(metadata: { provider?: string; providers?: string[] } | undefined) {
  const providers = metadata?.providers ?? (metadata?.provider ? [metadata.provider] : []);
  return metadata?.provider === "google" && providers.length === 1 && providers[0] === "google";
}

export function isFounderGoogleIdentity(
  email: unknown,
  appMetadata: { provider?: string; providers?: string[] } | undefined,
  founderEmail: string,
): boolean {
  return (
    normalizeEmail(email) !== "" &&
    normalizeEmail(email) === normalizeEmail(founderEmail) &&
    hasGoogleProvider(appMetadata)
  );
}

export function decideBeforeUserCreated(
  event: BeforeUserCreatedEvent,
  founderEmail: string,
): { error?: never } | { error: { http_code: 403; message: "Access denied." } } {
  if (isFounderGoogleIdentity(event.user?.email, event.user?.app_metadata, founderEmail)) {
    return {};
  }

  return {
    error: {
      http_code: 403,
      message: "Access denied.",
    },
  };
}

export function decideCustomAccessToken(
  event: CustomAccessTokenEvent,
  founderEmail: string,
): { claims: Record<string, unknown> & { user_role: "admin" | null } } {
  const sourceClaims = event.claims ?? {};
  const authorized = isFounderGoogleIdentity(
    sourceClaims.email,
    sourceClaims.app_metadata,
    founderEmail,
  );

  return {
    claims: {
      ...sourceClaims,
      user_role: authorized ? "admin" : null,
    },
  };
}
