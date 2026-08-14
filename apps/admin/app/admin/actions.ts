"use server";

import { requireAdmin } from "@/lib/auth/authorization";

/** Security-boundary probe retained for automated server-action authorization tests. */
export async function protectedAdminActionProbe() {
  const admin = await requireAdmin();
  return { authorized: true as const, userId: admin.userId };
}
