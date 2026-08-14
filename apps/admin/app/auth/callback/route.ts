import { readFounderAuthorizationEnvironment } from "@subtext/env/server";
import { createSupabaseServerClient } from "@subtext/supabase/server";
import { type NextRequest, NextResponse } from "next/server";

import { evaluateAdminAuthorization } from "@/lib/auth/authorization-core";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const oauthError = request.nextUrl.searchParams.get("error");
  const loginUrl = new URL("/login?error=authentication_failed", request.url);

  if (oauthError) return NextResponse.redirect(new URL("/access-denied", request.url));
  if (!code) return NextResponse.redirect(loginUrl);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(loginUrl);

  const { FOUNDER_EMAIL } = readFounderAuthorizationEnvironment();
  const authorization = await evaluateAdminAuthorization(supabase, FOUNDER_EMAIL);

  if (authorization.status !== "authorized") {
    await supabase.auth.signOut({ scope: "global" });
    return NextResponse.redirect(new URL("/access-denied", request.url));
  }

  return NextResponse.redirect(new URL("/admin", request.url));
}
