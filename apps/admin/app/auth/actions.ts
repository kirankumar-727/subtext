"use server";

import { readFounderAuthorizationEnvironment } from "@subtext/env/server";
import { createSupabaseServerClient } from "@subtext/supabase/server";
import type { Route } from "next";
import { redirect } from "next/navigation";

export async function signInWithGitHub() {
  const supabase = await createSupabaseServerClient();
  const { NEXT_PUBLIC_ADMIN_URL } = readFounderAuthorizationEnvironment();
  const callbackUrl = new URL("/auth/callback", NEXT_PUBLIC_ADMIN_URL).toString();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: callbackUrl,
      scopes: "read:user user:email",
    },
  });

  if (error || !data.url) redirect("/login?error=authentication_failed");
  redirect(data.url as Route);
}

export async function performLogout(client: {
  auth: { signOut(options: { scope: "global" }): Promise<{ error: unknown }> };
}) {
  return client.auth.signOut({ scope: "global" });
}

export async function logout() {
  const supabase = await createSupabaseServerClient();
  await performLogout(supabase);
  redirect("/login");
}