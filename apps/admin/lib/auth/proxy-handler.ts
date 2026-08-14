import "server-only";

import { readFounderAuthorizationEnvironment } from "@subtext/env/server";
import { refreshSupabaseSession } from "@subtext/supabase/proxy";
import { type NextRequest, NextResponse } from "next/server";

import type { AuthClaims } from "./authorization-core";
import { decideRouteAccess } from "./route-policy";

function copySessionCookies(source: NextResponse, target: NextResponse): NextResponse {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
  target.headers.set("Cache-Control", "private, no-store");
  return target;
}

export type SessionRefresher = typeof refreshSupabaseSession;

export function createAdminProxyHandler(refreshSession: SessionRefresher = refreshSupabaseSession) {
  return async function handleAdminProxy(request: NextRequest): Promise<NextResponse> {
    const session = await refreshSession(request);
    const { FOUNDER_EMAIL } = readFounderAuthorizationEnvironment();
    const claims = session.claims as AuthClaims | null;
    const decision = decideRouteAccess(request.nextUrl.pathname, claims, FOUNDER_EMAIL);

    if (decision === "allow") return session.response;

    if (decision === "api_unauthenticated" || decision === "api_forbidden") {
      return copySessionCookies(
        session.response,
        NextResponse.json(
          {
            error: decision === "api_unauthenticated" ? "authentication_required" : "forbidden",
          },
          { status: decision === "api_unauthenticated" ? 401 : 403 },
        ),
      );
    }

    const destination =
      decision === "redirect_admin"
        ? "/admin"
        : decision === "redirect_denied"
          ? "/access-denied"
          : "/login";
    const target = request.nextUrl.clone();
    target.pathname = destination;
    target.search = "";

    return copySessionCookies(session.response, NextResponse.redirect(target));
  };
}
