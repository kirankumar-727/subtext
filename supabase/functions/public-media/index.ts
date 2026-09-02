import { createClient } from "npm:@supabase/supabase-js@2.112.2";
import {
  isVariantUuid,
  matchesSecret,
  PUBLIC_MEDIA_SIGNED_URL_SECONDS,
} from "../_shared/media-delivery.ts";

function required(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function supabaseSecretKey() {
  const localFallback = Deno.env.get("SUPABASE_SECRET_KEY");
  if (localFallback) return localFallback;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
    if (keys.default) return keys.default;
  } catch {
    // Invalid platform configuration fails closed below.
  }
  throw new Error("Missing Supabase secret key configuration");
}

function mediaSignerAuthorized(request: Request) {
  const expected = Deno.env.get("PUBLIC_MEDIA_SIGNER_SECRET") ?? "";
  return (
    Boolean(expected) &&
    matchesSecret(expected, request.headers.get("x-subtext-media-signer-secret"))
  );
}

const supabase = createClient(required("SUPABASE_URL"), supabaseSecretKey(), {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

Deno.serve(async (request) => {
  if (request.method !== "GET" || !mediaSignerAuthorized(request)) {
    return new Response(null, { status: 404 });
  }

  const variantId = new URL(request.url).searchParams.get("variant_id");
  if (!isVariantUuid(variantId)) return new Response(null, { status: 404 });

  try {
    const [variantResult, publicationResult] = await Promise.all([
      supabase
        .from("media_variants")
        .select("storage_key,mime_type,is_public")
        .eq("id", variantId)
        .maybeSingle(),
      supabase
        .from("published_media")
        .select("variant_id")
        .eq("variant_id", variantId)
        .limit(1)
        .maybeSingle(),
    ]);
    const media = variantResult.data;
    if (
      variantResult.error ||
      publicationResult.error ||
      !media?.storage_key ||
      !media.is_public ||
      !publicationResult.data?.variant_id
    )
      return new Response(null, { status: 404 });

    const { data: signed, error: signedError } = await supabase.storage
      .from("media-public")
      .createSignedUrl(media.storage_key, PUBLIC_MEDIA_SIGNED_URL_SECONDS);
    if (signedError || !signed?.signedUrl) return new Response(null, { status: 404 });

    return new Response(null, {
      status: 307,
      headers: {
        Location: signed.signedUrl,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    // Never disclose whether a variant, Storage path, or object exists.
    return new Response(null, { status: 404 });
  }
});
