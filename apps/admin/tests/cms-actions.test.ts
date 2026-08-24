import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminMock = vi.hoisted(() => vi.fn());
const createSupabaseServerClientMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const afterMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());
const sharpMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/authorization", () => ({
  requireAdmin: requireAdminMock,
}));
vi.mock("@subtext/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}));
vi.mock("@subtext/content", () => ({
  deriveContentMetrics: () => ({ bodyPlainText: "Body", wordCount: 1, readingTimeMinutes: 1 }),
  slugify: (value: string) => value.toLowerCase().replace(/\s+/g, "-"),
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/server", () => ({ after: afterMock }));
vi.mock("sharp", () => ({ default: sharpMock }));

import {
  createMediaUploadIntent,
  createSourceInline,
  createStory,
  createTag,
  finalizeMediaUpload,
  requestStoryPublication,
  saveStoryDraft,
} from "@/app/admin/cms-actions";
import { rebaseDraftOntoServer } from "@/lib/cms/autosave";

const articleId = "90000000-0000-4000-8000-000000000001";
const revisionId = "90000000-0000-4000-8000-000000000002";
const pillarId = "90000000-0000-4000-8000-000000000003";

function query(result: unknown) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    insert: () => builder,
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

describe("saveStoryDraft conflict handling", () => {
  beforeEach(() => {
    requireAdminMock.mockReset().mockResolvedValue({ userId: "founder-id" });
    revalidatePathMock.mockReset();
    createSupabaseServerClientMock.mockReset();
  });

  it("returns the current server draft without advancing the local row version", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { code: "40001", message: "Story changed in another session" },
      })
      .mockResolvedValueOnce({
        data: null,
        error: { code: "40001", message: "Story changed in another session" },
      })
      .mockResolvedValueOnce({
        data: [{ article_id: articleId, row_version: 10 }],
        error: null,
      });
    const supabase = {
      rpc,
      from: (table: string) => {
        const results: Record<string, unknown> = {
          articles: {
            data: {
              row_version: 9,
              canonical_slug: "server-story",
              primary_pillar_id: pillarId,
              category_id: null,
              current_draft_revision_id: revisionId,
            },
            error: null,
          },
          article_revisions: {
            data: {
              title: "Server title",
              dek: "Server excerpt",
              body_markdown: "# Server title\n\nServer body",
              seo_title: "Server SEO",
              seo_description: "Server description",
            },
            error: null,
          },
          article_tags: { data: [{ tag_id: "90000000-0000-4000-8000-000000000004" }], error: null },
          citations: {
            data: [{ source_id: "90000000-0000-4000-8000-000000000005", ordinal: 1 }],
            error: null,
          },
          article_media: {
            data: { media_asset_id: "90000000-0000-4000-8000-000000000006" },
            error: null,
          },
        };
        return query(results[table]);
      },
    };
    createSupabaseServerClientMock.mockResolvedValue(supabase);

    const localDraft = {
      articleId,
      rowVersion: 4,
      title: "Local title",
      slug: "local-title",
      excerpt: "Local excerpt",
      markdown: "# Local title\n\nLocal body",
      pillarId,
      categoryId: null,
      tagIds: [],
      sourceIds: [],
      coverMediaAssetId: null,
      seoTitle: "",
      seoDescription: "",
    };
    const result = await saveStoryDraft(localDraft);

    expect(rpc).toHaveBeenCalledWith(
      "save_story_draft",
      expect.objectContaining({ p_expected_row_version: 4 }),
    );
    expect(result).toEqual({
      ok: false,
      code: "conflict",
      message: expect.any(String),
      currentDraft: expect.objectContaining({
        rowVersion: 9,
        title: "Server title",
        markdown: "# Server title\n\nServer body",
        tagIds: ["90000000-0000-4000-8000-000000000004"],
        sourceIds: ["90000000-0000-4000-8000-000000000005"],
        coverMediaAssetId: "90000000-0000-4000-8000-000000000006",
      }),
    });
    expect(result).not.toHaveProperty("latestRowVersion");
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(localDraft.rowVersion).toBe(4);
    expect(localDraft.title).toBe("Local title");

    const staleRetry = await saveStoryDraft(localDraft);
    expect(staleRetry).toEqual(expect.objectContaining({ ok: false, code: "conflict" }));
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      "save_story_draft",
      expect.objectContaining({ p_expected_row_version: 4 }),
    );
    expect(revalidatePathMock).not.toHaveBeenCalled();

    if (result.code !== "conflict" || !result.currentDraft) throw new Error("Expected a conflict");
    const reconciledDraft = rebaseDraftOntoServer(localDraft, result.currentDraft);
    expect(reconciledDraft.rowVersion).toBe(9);
    const retry = await saveStoryDraft(reconciledDraft);

    expect(retry).toEqual({
      ok: true,
      value: { article_id: articleId, row_version: 10 },
    });
    expect(rpc).toHaveBeenNthCalledWith(
      3,
      "save_story_draft",
      expect.objectContaining({
        p_expected_row_version: 9,
        p_title: "Local title",
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledTimes(2);
  });
});

describe("createStory slug collision handling", () => {
  beforeEach(() => {
    requireAdminMock.mockReset().mockResolvedValue({ userId: "founder-id" });
    createSupabaseServerClientMock.mockReset();
    redirectMock.mockReset();
  });

  it("adds a generated suffix when the initial slug already exists", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ article_id: articleId }], error: null });
    createSupabaseServerClientMock.mockResolvedValue({
      rpc,
      from: (table: string) => {
        if (table !== "articles") throw new Error(`Unexpected table: ${table}`);
        return query({ data: { id: "90000000-0000-4000-8000-000000000007" }, error: null });
      },
    });

    const formData = new FormData();
    formData.set("title", "Test Story");
    formData.set("pillarId", pillarId);

    await createStory(formData);

    expect(rpc).toHaveBeenCalledWith(
      "create_story_draft",
      expect.objectContaining({ p_slug: expect.stringMatching(/^test-story-[0-9a-f]{8}$/) }),
    );
    expect(redirectMock).toHaveBeenCalledWith(`/admin/stories/${articleId}`);
  });
});

describe("CMS action authorization and deduplication", () => {
  beforeEach(() => {
    requireAdminMock.mockReset().mockResolvedValue({ userId: "founder-id" });
    createSupabaseServerClientMock.mockReset();
    revalidatePathMock.mockReset();
  });

  it("does not open a Supabase client when the admin guard rejects", async () => {
    requireAdminMock.mockRejectedValue(new Error("not authorized"));

    await expect(createTag({ name: "Restricted" })).rejects.toThrow("not authorized");
    expect(createSupabaseServerClientMock).not.toHaveBeenCalled();
  });

  it("returns the existing tag when a duplicate insert races", async () => {
    const existing = {
      id: "90000000-0000-4000-8000-000000000004",
      name: "Existing tag",
      slug: "existing-tag",
    };
    let call = 0;
    createSupabaseServerClientMock.mockResolvedValue({
      from: (table: string) => {
        if (table !== "tags") throw new Error(`Unexpected table: ${table}`);
        call += 1;
        return query(
          call === 1
            ? { data: null, error: { code: "23505", message: "duplicate key" } }
            : { data: existing, error: null },
        );
      },
    });

    const result = await createTag({ name: "Existing tag" });

    expect(result).toEqual({ ok: true, tag: existing });
    expect(call).toBe(2);
  });

  it("returns the existing source when its generated fingerprint is duplicated", async () => {
    const existing = {
      id: "90000000-0000-4000-8000-000000000005",
      title: "Existing source",
      author_text: "An author",
      source_type: "website",
      url: "https://example.com/source",
    };
    let call = 0;
    createSupabaseServerClientMock.mockResolvedValue({
      from: (table: string) => {
        if (table !== "sources") throw new Error(`Unexpected table: ${table}`);
        call += 1;
        return query(
          call === 1
            ? { data: null, error: { code: "23505", message: "duplicate fingerprint" } }
            : { data: existing, error: null },
        );
      },
    });

    const result = await createSourceInline({
      sourceType: "website",
      title: "Existing source",
      authorText: "An author",
      url: "https://example.com/source",
    });

    expect(result).toEqual({ ok: true, source: existing });
    expect(call).toBe(2);
  });
});

describe("publication preflight feedback", () => {
  beforeEach(() => {
    requireAdminMock.mockReset().mockResolvedValue({ userId: "founder-id" });
    createSupabaseServerClientMock.mockReset();
    revalidatePathMock.mockReset();
    afterMock.mockReset();
  });

  it("allowlists validation feedback and does not dispatch an invalid publication", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message: "raw database detail: internal constraint and path",
      },
    });
    createSupabaseServerClientMock.mockResolvedValue({ rpc });

    const result = await requestStoryPublication({
      articleId,
      action: "publish",
      targetRevisionId: null,
    });

    expect(result).toEqual({
      ok: false,
      message:
        "Publication request failed validation. Check required media, citations, rights, and SEO metadata.",
    });
    expect(result.message).not.toContain("raw database detail");
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("uses a generic message for unexpected publication infrastructure errors", async () => {
    createSupabaseServerClientMock.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "500", message: "raw infrastructure detail" },
      }),
    });

    const result = await requestStoryPublication({
      articleId,
      action: "publish",
      targetRevisionId: null,
    });

    expect(result).toEqual({ ok: false, message: "Publication request could not be queued." });
    expect(result.message).not.toContain("raw infrastructure detail");
  });
});

describe("media integrity and cleanup", () => {
  const mediaAssetId = "90000000-0000-4000-8000-000000000006";

  beforeEach(() => {
    requireAdminMock.mockReset().mockResolvedValue({ userId: "founder-id" });
    createSupabaseServerClientMock.mockReset();
    sharpMock.mockReset();
  });

  it("rejects an invalid upload checksum before creating metadata", async () => {
    await expect(
      createMediaUploadIntent({
        filename: "photo.png",
        mimeType: "image/png",
        byteSize: 1024,
        checksumSha256: "not-a-sha256",
        altText: "A photo",
        rightsStatus: "owned",
      }),
    ).rejects.toThrow();
    expect(createSupabaseServerClientMock).not.toHaveBeenCalled();
  });

  it("rejects a checksum mismatch before image processing", async () => {
    const bytes = Buffer.from("bad");
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    createSupabaseServerClientMock.mockResolvedValue({
      from: (table: string) => {
        if (table !== "media_assets") throw new Error(`Unexpected table: ${table}`);
        return {
          select: () =>
            query({
              data: {
                id: mediaAssetId,
                original_storage_key: `${mediaAssetId}/original-photo.png`,
                byte_size: bytes.byteLength,
                checksum_sha256: "a".repeat(64),
                processing_status: "pending",
              },
              error: null,
            }),
          update,
        };
      },
      storage: {
        from: (bucket: string) => {
          if (bucket !== "media-originals") throw new Error(`Unexpected bucket: ${bucket}`);
          return {
            download: vi.fn().mockResolvedValue({ data: new Blob([bytes]), error: null }),
          };
        },
      },
    });

    await expect(finalizeMediaUpload(mediaAssetId)).rejects.toThrow(
      "Upload integrity check failed",
    );
    expect(sharpMock).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({
      processing_status: "failed",
      processing_error: "Upload integrity check failed",
    });
  });

  it("removes uploaded derivatives only when a later derivative upload fails", async () => {
    const originalBytes = Buffer.from("original");
    const variantBytes = Buffer.from("variant");
    const checksum = createHash("sha256").update(originalBytes).digest("hex");
    const asset = {
      id: mediaAssetId,
      original_filename: "photo.png",
      original_storage_key: `${mediaAssetId}/original-photo.png`,
      byte_size: originalBytes.byteLength,
      checksum_sha256: checksum,
      default_alt_text: "A photo",
      default_caption: null,
      credit_text: null,
      processing_status: "pending",
      created_at: "2026-08-23T00:00:00.000Z",
    };
    const updates: unknown[] = [];
    const update = vi.fn((payload: unknown) => {
      updates.push(payload);
      return { eq: vi.fn().mockResolvedValue({ error: null }) };
    });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const upload = vi
      .fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: "storage unavailable" } });
    const variantsDelete = vi.fn();
    const rotate = vi.fn();
    const clone = vi.fn();
    const sourceImage = {
      rotate,
      metadata: vi.fn().mockResolvedValue({ width: 1500, height: 1000 }),
      clone,
    };
    rotate.mockReturnValue(sourceImage);
    clone.mockReturnValue({
      resize: () => ({
        webp: () => ({ toBuffer: vi.fn().mockResolvedValue(variantBytes) }),
      }),
    });
    sharpMock.mockImplementation((input: unknown) => {
      if (Buffer.isBuffer(input) && input.equals(originalBytes)) return sourceImage;
      return { metadata: vi.fn().mockResolvedValue({ width: 640, height: 427 }) };
    });

    createSupabaseServerClientMock.mockResolvedValue({
      from: (table: string) => {
        if (table === "media_assets") {
          return {
            select: () => query({ data: asset, error: null }),
            update,
          };
        }
        if (table === "media_variants") {
          return { insert: vi.fn(), delete: variantsDelete };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
      storage: {
        from: (bucket: string) => {
          if (bucket === "media-originals") {
            return {
              download: vi.fn().mockResolvedValue({
                data: new Blob([originalBytes]),
                error: null,
              }),
            };
          }
          if (bucket === "media-public") return { upload, remove };
          throw new Error(`Unexpected bucket: ${bucket}`);
        },
      },
    });

    await expect(finalizeMediaUpload(mediaAssetId)).rejects.toThrow("Image processing failed");
    expect(upload).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledWith([`${mediaAssetId}/w640.webp`]);
    expect(variantsDelete).not.toHaveBeenCalled();
    expect(updates).toContainEqual({
      processing_status: "failed",
      processing_error: "Deterministic image processing failed",
    });
  });
});
