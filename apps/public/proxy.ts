import { createSupabasePublicServerClient } from "@subtext/supabase/public-server";
import { type NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname.split("/").filter(Boolean).length !== 2) return NextResponse.next();
  const supabase = createSupabasePublicServerClient();
  const { data } = await supabase
    .from("public_redirects")
    .select("to_path,http_status")
    .eq("from_path", pathname)
    .maybeSingle();
  if (!data?.to_path) return NextResponse.next();
  const destination = request.nextUrl.clone();
  destination.pathname = data.to_path;
  destination.search = "";
  return NextResponse.redirect(destination, data.http_status === 308 ? 308 : 301);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|feed.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
