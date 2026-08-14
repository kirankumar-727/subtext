import "server-only";

import { NextResponse } from "next/server";

import { requireAdmin } from "./authorization";
import { AdminAccessError } from "./errors";

export function withAdminApi<TContext extends unknown[]>(
  handler: (admin: { userId: string }, ...context: TContext) => Promise<Response>,
) {
  return async (...context: TContext): Promise<Response> => {
    try {
      const admin = await requireAdmin();
      const response = await handler(admin, ...context);
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    } catch (error) {
      if (error instanceof AdminAccessError) {
        return NextResponse.json(
          { error: error.kind === "unauthenticated" ? "authentication_required" : "forbidden" },
          {
            status: error.kind === "unauthenticated" ? 401 : 403,
            headers: { "Cache-Control": "private, no-store" },
          },
        );
      }
      throw error;
    }
  };
}
