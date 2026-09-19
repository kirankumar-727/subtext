import "server-only";

import { createHash } from "node:crypto";
import sharp from "sharp";

import type { createSupabaseServerClient } from "@subtext/supabase/server";
import type { MediaItem } from "@/lib/cms/types";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export async function processMediaAsset(
  supabase: SupabaseClient,
  mediaAssetId: string,
): Promise<MediaItem> {
  const { data: asset, error: assetReadError } = await supabase
    .from("media_assets")
    .select("*")
    .eq("id", mediaAssetId)
    .single();

  if (assetReadError || !asset || asset.processing_status !== "pending") {
    throw new Error("Media asset is not ready to process");
  }

  const { data: original, error: downloadError } = await supabase.storage
    .from("media-originals")
    .download(asset.original_storage_key);

  if (downloadError || !original) {
    await supabase
      .from("media_assets")
      .update({
        processing_status: "failed",
        processing_error: "Uploaded original could not be read",
      })
      .eq("id", mediaAssetId);
    throw new Error("Uploaded original could not be read");
  }

  const bytes = Buffer.from(await original.arrayBuffer());
  if (
    bytes.byteLength !== asset.byte_size ||
    createHash("sha256").update(bytes).digest("hex") !== asset.checksum_sha256
  ) {
    await supabase
      .from("media_assets")
      .update({
        processing_status: "failed",
        processing_error: "Upload integrity check failed",
      })
      .eq("id", mediaAssetId);
    throw new Error("Upload integrity check failed");
  }

  const uploadedVariantKeys: string[] = [];
  let variantsInserted = false;

  try {
    const image = sharp(bytes, { failOn: "error" }).rotate();
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error("Image dimensions could not be read");
    }

    await supabase
      .from("media_assets")
      .update({
        processing_status: "processing",
        width: metadata.width,
        height: metadata.height,
      })
      .eq("id", mediaAssetId);

    const widths = [640, 1280, 1920].filter((width) => width <= metadata.width!);
    if (widths.length === 0) widths.push(metadata.width);

    const variants = [];
    let representativeKey: string | null = null;
    let representativeWidth: number | null = null;
    let representativeHeight: number | null = null;

    for (const width of [...new Set(widths)]) {
      const variantBytes = await image
        .clone()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();

      const key = `${mediaAssetId}/w${width}.webp`;
      const upload = await supabase.storage
        .from("media-public")
        .upload(key, variantBytes, {
          contentType: "image/webp",
          upsert: false,
        });

      if (upload.error) throw upload.error;
      uploadedVariantKeys.push(key);

      const variantMeta = await sharp(variantBytes).metadata();
      const vWidth = variantMeta.width ?? width;
      const vHeight =
        variantMeta.height ??
        Math.round((metadata.height! / metadata.width!) * width);

      variants.push({
        media_asset_id: mediaAssetId,
        variant_name: `w${width}`,
        storage_key: key,
        mime_type: "image/webp",
        format: "webp",
        width: vWidth,
        height: vHeight,
        byte_size: variantBytes.byteLength,
        checksum_sha256: createHash("sha256").update(variantBytes).digest("hex"),
        is_public: true,
      });

      if (!representativeKey) {
        representativeKey = key;
        representativeWidth = vWidth;
        representativeHeight = vHeight;
      }
    }

    const { error: variantsError } = await supabase
      .from("media_variants")
      .insert(variants);
    if (variantsError) throw variantsError;

    variantsInserted = true;

    const { error: readyError } = await supabase
      .from("media_assets")
      .update({
        processing_status: "ready",
        processing_error: null,
      })
      .eq("id", mediaAssetId);

    if (readyError) throw readyError;

    const publicUrl = representativeKey
      ? supabase.storage.from("media-public").getPublicUrl(representativeKey).data.publicUrl
      : null;

    return {
      id: asset.id,
      kind: asset.kind,
      original_filename: asset.original_filename,
      mime_type: asset.mime_type,
      byte_size: asset.byte_size,
      default_alt_text: asset.default_alt_text,
      default_caption: asset.default_caption,
      credit_text: asset.credit_text,
      rights_status: asset.rights_status,
      processing_status: "ready",
      created_at: asset.created_at,
      publicUrl,
      hasPublicVariant: Boolean(representativeKey),
      width: representativeWidth,
      height: representativeHeight,
    };
  } catch (error) {
    if (!variantsInserted && uploadedVariantKeys.length) {
      await supabase.storage.from("media-public").remove(uploadedVariantKeys);
    }

    await supabase
      .from("media_assets")
      .update({
        processing_status: "failed",
        processing_error:
          error instanceof Error
            ? error.message.slice(0, 500)
            : "Deterministic image processing failed",
      })
      .eq("id", mediaAssetId);

    throw new Error("Image processing failed");
  }
}
