import "server-only";

import { createSupabasePublicServerClient } from "@subtext/supabase/public-server";
import { NextResponse } from "next/server";
import { z } from "zod";

type MediaRouteProps = {
  params: Promise<{ variantId: string }>;
};

export async function GET(_request: Request, { params }: MediaRouteProps) {
  const { variantId } = await params;
  if (!z.uuid().safeParse(variantId).success) {
    return new NextResponse(null, { status: 404 });
  }

  const signerSecret = process.env.PUBLIC_MEDIA_SIGNER_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!signerSecret || !supabaseUrl) return new NextResponse(null, { status: 404 });

  try {
    // Resolve through the anonymous-safe published projection without exposing
    // its Storage key to the browser. The Edge Function repeats the complete
    // eligibility check with the provider-managed service key before signing.
    const supabase = createSupabasePublicServerClient();
    const { data: media, error: mediaError } = await supabase
      .from("published_media")
      .select("variant_id")
      .eq("variant_id", variantId)
      .limit(1)
      .maybeSingle();
    if (mediaError || !media?.variant_id) return new NextResponse(null, { status: 404 });

    const signerUrl = new URL("/functions/v1/public-media", supabaseUrl);
    signerUrl.searchParams.set("variant_id", variantId);
    const signedResponse = await fetch(signerUrl, {
      cache: "no-store",
      headers: { "x-subtext-media-signer-secret": signerSecret },
      redirect: "manual",
    });
    const location = signedResponse.headers.get("location");
    if (signedResponse.status !== 307 || !location) return new NextResponse(null, { status: 404 });

    const response = NextResponse.redirect(location, 307);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  } catch {
    // Do not disclose whether a path, object, or database row exists.
    return new NextResponse(null, { status: 404 });
  }
}
