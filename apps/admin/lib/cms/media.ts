import { z } from "zod";

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export const mediaUploadMetadataSchema = z.object({
  altText: z.string().trim().min(1).max(500),
  caption: z.string().trim().max(1000).optional(),
  credit: z.string().trim().max(300).optional(),
  rightsStatus: z.enum([
    "owned",
    "licensed",
    "public_domain",
    "creative_commons",
    "permission_granted",
  ]),
});

export const mediaUploadRequestSchema = mediaUploadMetadataSchema.extend({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(100),
  byteSize: z.number().int(),
  checksumSha256: z.string().regex(/^[0-9a-f]{64}$/),
});

export function safeFilename(name: string) {
  return (
    name
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^\.+/, "")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "image"
  );
}

export function isSupportedImageUpload(input: {
  mimeType: string;
  byteSize: number;
  checksumSha256: string;
}) {
  return (
    Number.isInteger(input.byteSize) &&
    input.byteSize > 0 &&
    input.byteSize <= MAX_IMAGE_BYTES &&
    IMAGE_MIME_TYPES.has(input.mimeType) &&
    /^[0-9a-f]{64}$/.test(input.checksumSha256)
  );
}
