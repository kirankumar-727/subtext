import "server-only";

import { readFounderAuthorizationEnvironment } from "@subtext/env/server";
import { createSupabaseAdminClient } from "@subtext/supabase/admin";
import { createSupabaseServerClient } from "@subtext/supabase/server";
import { redirect } from "next/navigation";

import { evaluateAdminAuthorization } from "./authorization-core";
import { AdminAccessError } from "./errors";

export async function getAdminAuthorization() {
  const client = await createSupabaseServerClient();
  const { FOUNDER_EMAIL } = readFounderAuthorizationEnvironment();
  return evaluateAdminAuthorization(client, FOUNDER_EMAIL);
}

export async function requireAdmin() {
  const authorization = await getAdminAuthorization();

  if (authorization.status === "unauthenticated") {
    throw new AdminAccessError("unauthenticated");
  }

  if (authorization.status === "unauthorized") {
    throw new AdminAccessError("unauthorized");
  }

  return authorization.admin;
}

export async function requireAdminPage() {
  try {
    return await requireAdmin();
  } catch (error) {
    if (error instanceof AdminAccessError) {
      redirect(error.kind === "unauthenticated" ? "/login" : "/access-denied");
    }
    throw error;
  }
}

/**
 * The only approved gateway to the RLS-bypassing client. The caller is verified
 * using a fresh request-scoped session before the privileged client is created.
 */
export async function withAuthorizedAdminClient<T>(
  operation: (context: {
    admin: { userId: string };
    client: ReturnType<typeof createSupabaseAdminClient>;
  }) => Promise<T>,
): Promise<T> {
  const admin = await requireAdmin();
  const client = createSupabaseAdminClient();
  return operation({ admin, client });
}
