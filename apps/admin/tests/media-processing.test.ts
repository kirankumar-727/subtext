import { describe, expect, it, vi } from "vitest";

import { processMediaAsset } from "@/lib/cms/media-processing";

const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function makeQuery(data: unknown) {
  const query: Record<string, unknown> = {};
  query.select = () => query;
  query.eq = () => query;
  query.single = () => Promise.resolve({ data, error: null });
  query.insert = () => Promise.resolve({ error: null });
  query.update = () => query;
  return query;
}

describe("processMediaAsset", () => {
  it("processes a pending image into public variants and marks it ready", async () => {
    const uploads: Array<{ bucket: string; key: string }> = [];
    const updates: Array<Record<string, unknown>> = [];

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "media_assets") {
          const query = makeQuery({
            id: "media-001",
            kind: "image",
            original_filename: "cover.png",
            original_storage_key: "media-001/original-cover.png",
            checksum_sha256: require("node:crypto")
              .createHash("sha256")
              .update(ONE_PIXEL_PNG)
              .digest("hex"),
            mime_type: "image/png",
            byte_size: ONE_PIXEL_PNG.byteLength,
            default_alt_text: "Cover",
            default_caption: null,
            credit_text: null,
            rights_status: "unknown",
            processing_status: "pending",
            created_at: "2026-01-01T00:00:00Z",
          });
          query.update = (data: Record<string, unknown>) => {
            updates.push(data);
            return { eq: () => Promise.resolve({ error: null }) };
          };
          return query;
        }

        if (table === "media_variants") {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
      storage: {
        from: (bucket: string) => ({
          download: vi.fn().mockResolvedValue({
            data: new Blob([ONE_PIXEL_PNG]),
            error: null,
          }),
          upload: vi.fn().mockImplementation((key: string) => {
            uploads.push({ bucket, key });
            return Promise.resolve({ error: null });
          }),
          remove: vi.fn().mockResolvedValue({ error: null }),
          getPublicUrl: (key: string) => ({
            data: { publicUrl: `https://example.com/${key}` },
          }),
        }),
      },
    } as never;

    const media = await processMediaAsset(supabase, "media-001");

    expect(media.processing_status).toBe("ready");
    expect(media.hasPublicVariant).toBe(true);
    expect(uploads).toHaveLength(1);
    expect(uploads[0]!.bucket).toBe("media-public");
    expect(updates.some((update) => update.processing_status === "processing")).toBe(true);
    expect(updates.some((update) => update.processing_status === "ready")).toBe(true);
  });
});
