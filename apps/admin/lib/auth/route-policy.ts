import type { AuthClaims } from "./authorization-core";
import { normalizeEmail } from "./authorization-core";

export type RouteDecision =
  | "allow"
  | "redirect_admin"
  | "redirect_login"
  | "redirect_denied"
  | "api_unauthenticated"
  | "api_forbidden";

export function isProtectedAdminPath(pathname: string): boolean {
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/api" ||
    pathname.startsWith("/api/")
  );
}

export function isOptimisticallyAuthorized(
  claims: AuthClaims | null,
  founderEmail: string,
): boolean {
  const provider = claims?.app_metadata?.provider;
  const providers =
    claims?.app_metadata?.providers ?? (provider ? [provider] : []);

  return Boolean(
    claims?.sub &&
    claims.user_role === "admin" &&
    !claims.is_anonymous &&
    normalizeEmail(claims.email) === normalizeEmail(founderEmail) &&
    provider === "github" &&
    providers.length === 1 &&
    providers[0] === "github",
  );
}

export function decideRouteAccess(
  pathname: string,
  claims: AuthClaims | null,
  founderEmail: string,
): RouteDecision {
  const isApi = pathname === "/api" || pathname.startsWith("/api/");
  const isProtected = isProtectedAdminPath(pathname);
  const isAuthorized = isOptimisticallyAuthorized(claims, founderEmail);

  if (isProtected && !claims?.sub) {
    return isApi ? "api_unauthenticated" : "redirect_login";
  }

  if (isProtected && !isAuthorized) {
    return isApi ? "api_forbidden" : "redirect_denied";
  }

  if (pathname === "/") {
    return isAuthorized ? "redirect_admin" : "redirect_login";
  }

  if (pathname === "/login" && isAuthorized) {
    return "redirect_admin";
  }

  return "allow";
}