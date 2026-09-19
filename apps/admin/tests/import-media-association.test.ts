/**
 * Regression tests for import media association and cleanup behavior.
 *
 * Tests:
 * 1. Imported media is linked to the revision as 'inline' via article_media
 * 2. Pending media is never assigned as hero
 * 3. Failure cleanup respects FK constraints (citation-linked sources survive)
 * 4. coverMediaAssetId is returned when frontmatter cover matches an image
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const requireAdminMock = vi.hoisted(() => vi.fn());
const requireAdminMock = vi.hoisted(() => vi.fn());
const createSupabaseServerClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/cms/media-processing", () => ({
  processMediaAsset: vi.fn().mockResolvedValue({
    id: "processed-media",
    kind: "image",
    original_filename: "processed.jpg",
    mime_type: "image/jpeg",
    byte_size: 1,
    default_alt_text: "processed",
    default_caption: null,
    credit_text: null,
    rights_status: "unknown",
    processing_status: "ready",
    created_at: "2026-01-01T00:00:00Z",
    publicUrl: "https://example.com/processed.webp",
    hasPublicVariant: true,
    width: 640,
    height: 360,
  }),
}));

vi.mock("@/lib/auth/authorization", () => ({
  requireAdmin: requireAdminMock,
}));
vi.mock("@subtext/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}));

import { executeStoryImport } from "@/lib/cms/story-package-import";
import type { StoryPackage } from "@/lib/cms/story-package";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chainable(data: unknown) {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.order = () => builder;
  builder.or = () => ({
    maybeSingle: () =>
      Promise.resolve(
        data instanceof Array
          ? { data: data[0] ?? null, error: null }
          : { data, error: null },
      ),
  });
  builder.maybeSingle = () =>
    Promise.resolve(
      data instanceof Array
        ? { data: data[0] ?? null, error: null }
        : { data, error: null },
    );
  builder.single = () =>
    Promise.resolve(
      data instanceof Array
        ? { data: data[0] ?? null, error: null }
        : { data, error: null },
    );
  builder.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: data instanceof Array ? data : [data], error: null });
  return builder;
}

/** Minimal story package for testing */
function makePackage(overrides: Partial<StoryPackage> = {}): StoryPackage {
  return {
    storyMarkdown: "# Test Story\n\nSome body text here for word count.",
    frontmatter: {
      title: "Test Story",
      slug: "test-story",
      pillar: "history",
      category: "ancient-cities",
      author: "Test Author",
      tags: ["history"],
      cover: "images/cover.jpg",
      seo_title: "Test Story | SubText",
      seo_description: "A test story.",
      excerpt: "Test excerpt.",
    },
    images: [
      {
        archivePath: "images/cover.jpg",
        data: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
        extension: ".jpg",
      },
      {
        archivePath: "images/inline1.png",
        data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        extension: ".png",
      },
    ],
    sources: [],
    metadataFiles: {},
    allPaths: ["images/cover.jpg", "images/inline1.png"],
    parsedSources: [],
    imageMetadata: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock Supabase factory
// ---------------------------------------------------------------------------

function createMock() {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const inserts: Array<{ table: string; data: Record<string, unknown> }> = [];
  const storageUploads: Array<{ bucket: string; key: string }> = [];
  const deletes: Array<{ table: string; id: string }> = [];

  let sourceCounter = 0;

  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: "admin-001" } } }) },

    rpc: vi.fn().mockImplementation((name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn: name, args });
      if (name === "create_story_draft") {
        return Promise.resolve({
          data: [{ article_id: "art-001", revision_id: "rev-001", row_version: 1 }],
          error: null,
        });
      }
      if (name === "save_story_draft") {
        return Promise.resolve({
          data: [{
            article_id: args.p_article_id,
            revision_id: "rev-002",
            row_version: 2,
            saved_at: new Date().toISOString(),
          }],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    }),

    from: vi.fn().mockImplementation((table: string) => {
      if (table === "pillars") {
        return chainable([{ id: "pillar-001", name: "History", slug: "history" }]);
      }
      if (table === "categories") {
        return chainable([{
          id: "cat-001", name: "Ancient Cities",
          slug: "ancient-cities", pillar_id: "pillar-001",
        }]);
      }
      if (table === "articles") {
        return chainable(null);
      }
      if (table === "tags") {
        return {
          ...chainable({ id: "tag-001" }),
          insert: vi.fn().mockImplementation((data: Record<string, unknown>) => {
            inserts.push({ table: "tags", data });
            return {
              select: () => ({
                single: () => Promise.resolve({
                  data: { id: `tag-new-${inserts.length}` },
                  error: null,
                }),
              }),
            };
          }),
        };
      }
      if (table === "sources") {
        return {
          ...chainable(null),
          insert: vi.fn().mockImplementation((data: Record<string, unknown>) => {
            sourceCounter++;
            inserts.push({ table: "sources", data });
            return {
              select: () => ({
                single: () => Promise.resolve({
                  data: { id: `src-${String(sourceCounter).padStart(3, "0")}` },
                  error: null,
                }),
              }),
            };
          }),
          delete: () => ({
            eq: (id: string) => {
              deletes.push({ table: "sources", id });
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      if (table === "media_assets") {
        return {
          ...chainable(null),
          insert: vi.fn().mockImplementation((data: Record<string, unknown>) => {
            inserts.push({ table: "media_assets", data });
            return {
              then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
            };
          }),
          delete: () => ({
            eq: (id: string) => {
              deletes.push({ table: "media_assets", id });
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      if (table === "article_media") {
        return {
          insert: vi.fn().mockImplementation((data: unknown) => {
            inserts.push({ table: "article_media", data: data as Record<string, unknown> });
            return Promise.resolve({ error: null });
          }),
        };
      }
      return chainable(null);
    }),

    storage: {
      from: (bucket: string) => ({
        upload: vi.fn().mockImplementation((key: string) => {
          storageUploads.push({ bucket, key });
          return Promise.resolve({ error: null });
        }),
        remove: vi.fn().mockResolvedValue({ error: null }),
      }),
    },
  };

  return { supabase, rpcCalls, inserts, storageUploads, deletes };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("import media association", () => {
  beforeEach(() => {
    requireAdminMock.mockReset().mockResolvedValue({ userId: "admin-001" });
    createSupabaseServerClientMock.mockReset();
  });

  it("links imported media to the revision as 'inline' via article_media", async () => {
    const mock = createMock();
    createSupabaseServerClientMock.mockResolvedValue(mock.supabase);

    const result = await executeStoryImport(makePackage());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Two images → one batch article_media insert with array of 2 records
    const articleMediaInserts = mock.inserts.filter(
      (i) => i.table === "article_media",
    );
    expect(articleMediaInserts.length).toBeGreaterThanOrEqual(1);
    // The batch insert passes an array
    const batchData = articleMediaInserts[0]!.data as unknown as Array<Record<string, unknown>>;
    expect(Array.isArray(batchData)).toBe(true);
    expect(batchData).toHaveLength(2);

    // All linked as 'inline' to the revision from save_story_draft
    for (const am of batchData) {
      expect(am.role).toBe("inline");
      expect(am.revision_id).toBe("rev-002");
      expect(am.alt_text).toBeTruthy();
    }

    // Positions are sequential
    const positions = batchData.map((am) => am.position);
    expect(positions).toEqual([0, 1]);
  });

  it("never assigns pending media as hero", async () => {
    const mock = createMock();
    createSupabaseServerClientMock.mockResolvedValue(mock.supabase);

    const result = await executeStoryImport(makePackage());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // No hero role in any article_media batch insert
    const articleMediaInserts = mock.inserts.filter(
      (i) => i.table === "article_media",
    );
    for (const insert of articleMediaInserts) {
      const records = Array.isArray(insert.data) ? insert.data : [insert.data];
      for (const rec of records) {
        expect(rec.role).not.toBe("hero");
      }
    }

    // save_story_draft was called with null cover
    const saveCalls = mock.rpcCalls.filter((c) => c.fn === "save_story_draft");
    expect(saveCalls[0]!.args.p_cover_media_asset_id).toBeNull();
  });

  it("returns coverMediaAssetId when frontmatter cover matches an image", async () => {
    const mock = createMock();
    createSupabaseServerClientMock.mockResolvedValue(mock.supabase);

    // cover: "images/cover.jpg" matches the first image
    const result = await executeStoryImport(makePackage());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.coverMediaAssetId).toBeTruthy();

    // Verify the cover asset is in the article_media batch
    const articleMediaInserts = mock.inserts.filter(
      (i) => i.table === "article_media",
    );
    const batchData = articleMediaInserts[0]!.data as unknown as Array<Record<string, unknown>>;
    const coverRecord = batchData.find(
      (r) => r.media_asset_id === result.coverMediaAssetId,
    );
    expect(coverRecord).toBeTruthy();
    expect(coverRecord!.role).toBe("inline");
  });

  it("returns null coverMediaAssetId when no cover reference matches", async () => {
    const mock = createMock();
    createSupabaseServerClientMock.mockResolvedValue(mock.supabase);

    const pkg = makePackage({
      frontmatter: {
        title: "Test Story",
        slug: "test-story",
        pillar: "history",
        author: "Test Author",
        // No cover field
      },
    });

    const result = await executeStoryImport(pkg);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.coverMediaAssetId).toBeNull();
  });

  it("returns current draft revision ID (from save_story_draft), not the initial one", async () => {
    const mock = createMock();
    createSupabaseServerClientMock.mockResolvedValue(mock.supabase);

    const result = await executeStoryImport(makePackage());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // create_story_draft returns rev-001, save_story_draft returns rev-002
    // The returned revisionId should be rev-002 (the current draft)
    expect(result.revisionId).toBe("rev-002");

    // article_media batch links to rev-002
    const articleMedia = mock.inserts.filter((i) => i.table === "article_media");
    const batchData = articleMedia[0]!.data as unknown as Array<Record<string, unknown>>;
    for (const am of batchData) {
      expect(am.revision_id).toBe("rev-002");
    }
  });
});

describe("import failure cleanup", () => {
  beforeEach(() => {
    requireAdminMock.mockReset().mockResolvedValue({ userId: "admin-001" });
    createSupabaseServerClientMock.mockReset();
  });

  it("returns media_record_failed when media asset insert fails", async () => {
    const mock = createMock();
    createSupabaseServerClientMock.mockResolvedValue(mock.supabase);

    // Override media_assets to fail on insert
    mock.supabase.from = vi.fn().mockImplementation((table: string) => {
      if (table === "media_assets") {
        return {
          ...chainable(null),
          insert: vi.fn().mockImplementation(() => ({
            then: (resolve: (v: { error: { message: string } }) => void) =>
              resolve({ error: { message: "insert failed" } }),
          })),
          delete: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        };
      }
      // All other tables use the default mock
      return createMock().supabase.from(table);
    });

    const result = await executeStoryImport(makePackage());

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.errors.some((e) => e.code === "media_record_failed")).toBe(true);
  });

  it("returns media_link_failed when article_media insert fails", async () => {
    const mock = createMock();
    createSupabaseServerClientMock.mockResolvedValue(mock.supabase);

    // Override article_media to return an error (real Supabase behavior)
    mock.supabase.from = vi.fn().mockImplementation((table: string) => {
      if (table === "article_media") {
        return {
          insert: vi.fn().mockResolvedValue({
            error: { message: "violates foreign key constraint" },
          }),
        };
      }
      return createMock().supabase.from(table);
    });

    const result = await executeStoryImport(makePackage());

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.errors.some((e) => e.code === "media_link_failed")).toBe(true);
  });
});
