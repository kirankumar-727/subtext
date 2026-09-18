/**
 * Full end-to-end import execution test with mocked Supabase.
 *
 * Exercises the complete pipeline:
 *   parseStoryPackage → generateImportPreview → executeStoryImport
 *
 * Uses the real canonical ZIP. Mocks Supabase to simulate the exact
 * database interactions that would occur in production.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi, beforeEach } from "vitest";

const requireAdminMock = vi.hoisted(() => vi.fn());
const createSupabaseServerClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/authorization", () => ({
  requireAdmin: requireAdminMock,
}));
vi.mock("@subtext/supabase/server", () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}));

import { parseStoryPackage } from "@/lib/cms/story-package";
import {
  generateImportPreview,
  executeStoryImport,
} from "@/lib/cms/story-package-import";

const ZIP_PATH = "/home/user/subtext/.transfer/the-city-that-was-built-to-remember.zip";
const zipAvailable = existsSync(ZIP_PATH);
function loadZip() {
  return new Uint8Array(readFileSync(ZIP_PATH));
}

// ---------------------------------------------------------------------------
// Helpers
// Helpers
// ---------------------------------------------------------------------------

/** Build a chainable Supabase query builder that resolves to `data` */
function chainable(data: unknown) {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.order = () => builder;
  builder.or = () => ({
    maybeSingle: () => Promise.resolve(data instanceof Array ? { data: data[0] ?? null, error: null } : { data, error: null }),
  });
  builder.maybeSingle = () =>
    Promise.resolve(data instanceof Array ? { data: data[0] ?? null, error: null } : { data, error: null });
  builder.single = () =>
    Promise.resolve(data instanceof Array ? { data: data[0] ?? null, error: null } : { data, error: null });
  // Thenable for direct await (preview path)
  builder.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: data instanceof Array ? data : [data], error: null });
  return builder;
}

// ---------------------------------------------------------------------------
// Realistic Supabase mock
// ---------------------------------------------------------------------------

function createRealisticMock() {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const inserts: Array<{ table: string; data: Record<string, unknown> }> = [];
  const storageUploads: Array<{ bucket: string; key: string; size: number }> = [];
  const deletes: Array<{ table: string; id: string }> = [];

  let sourceCounter = 0;

  const supabase = {
    auth: {
      getUser: async () => ({
        data: { user: { id: "admin-user-001" } },
      }),
    },

    rpc: vi.fn().mockImplementation((name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn: name, args });

      if (name === "create_story_draft") {
        return Promise.resolve({
          data: [{
            article_id: "art-e2e-0001",
            revision_id: "rev-e2e-0001",
            row_version: 1,
          }],
          error: null,
        });
      }

      if (name === "save_story_draft") {
        return Promise.resolve({
          data: [{ article_id: args.p_article_id, row_version: 2 }],
          error: null,
        });
      }

      return Promise.resolve({ data: null, error: null });
    }),

    from: vi.fn().mockImplementation((table: string) => {
      if (table === "pillars") {
        return chainable([{ id: "pillar-history-001", name: "History", slug: "history" }]);
      }

      if (table === "categories") {
        return chainable([{
          id: "cat-ancient-cities-001",
          name: "Ancient Cities",
          slug: "ancient-cities",
          pillar_id: "pillar-history-001",
        }]);
      }

      if (table === "articles") {
        return chainable(null);
      }

      if (table === "tags") {
        return {
          ...chainable({ id: "tag-existing-001" }),
          insert: vi.fn().mockImplementation((data: Record<string, unknown>) => {
            inserts.push({ table: "tags", data });
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: { id: `tag-new-${inserts.length}`, name: data.name, slug: data.slug },
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
                single: () =>
                  Promise.resolve({
                    data: { id: `src-e2e-${String(sourceCounter).padStart(3, "0")}` },
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

      if (table === "article_media_assets" || table === "media_asset_sources") {
        return {
          insert: vi.fn().mockImplementation((data: Record<string, unknown>) => {
            inserts.push({ table, data });
            return {
              then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
            };
          }),
        };
      }

      return chainable(null);
    }),

    storage: {
      from: (bucket: string) => ({
        upload: vi.fn().mockImplementation((key: string, data: unknown) => {
          const size = data instanceof Buffer ? data.byteLength : 0;
          storageUploads.push({ bucket, key, size });
          return Promise.resolve({ error: null });
        }),
        remove: vi.fn().mockResolvedValue({ error: null }),
      }),
    },
  };

  return {
    supabase,
    rpcCalls,
    inserts,
    storageUploads,
    deletes,
    get sourceCount() { return sourceCounter; },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!zipAvailable)("E2E full import execution — canonical ZIP", () => {
  beforeEach(() => {
    requireAdminMock.mockReset().mockResolvedValue({ userId: "admin-user-001" });
    createSupabaseServerClientMock.mockReset();
  });

  it("full pipeline: parse → preview → import", async () => {
    // ---- Phase 1: Parse ----
    const parseResult = await parseStoryPackage(loadZip());
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const pkg = parseResult.pkg;

    // ---- Phase 2: Preview ----
    const mock = createRealisticMock();
    createSupabaseServerClientMock.mockResolvedValue(mock.supabase);

    const preview = await generateImportPreview(pkg);

    expect(preview.title).toBe("The City That Was Built to Remember");
    expect(preview.slug).toBe("the-city-that-was-built-to-remember");
    expect(preview.pillarName).toBe("History");
    expect(preview.categoryName).toBe("Ancient Cities");
    expect(preview.authorName).toBe("SubText Editorial");
    expect(preview.wordCount).toBeGreaterThan(0);
    expect(preview.readingTimeMinutes).toBeGreaterThan(0);

    // Citation count: 14 from sources.md
    expect(preview.citationCount).toBe(14);

    // Media count: 4 images discovered from ZIP
    expect(preview.mediaCount).toBeGreaterThanOrEqual(4);

    // Tags: 6
    expect(preview.tagNames).toHaveLength(6);

    // Can import
    expect(preview.canImport).toBe(true);

    // Rights warnings present
    expect(preview.warnings.some((w) =>
      w.code === "image_rights_unresolved",
    )).toBe(true);

    // ---- Phase 3: Execute import ----
    const importResult = await executeStoryImport(pkg);

    expect(importResult.ok).toBe(true);
    if (!importResult.ok) {
      console.error("Import errors:", importResult.errors);
      return;
    }

    expect(importResult.articleId).toBe("art-e2e-0001");
    expect(importResult.revisionId).toBe("rev-e2e-0001");

    // ---- Verify RPC calls ----

    // 1. create_story_draft called once
    const createCalls = mock.rpcCalls.filter((c) => c.fn === "create_story_draft");
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0]!.args.p_title).toBe("The City That Was Built to Remember");
    expect(createCalls[0]!.args.p_slug).toBe("the-city-that-was-built-to-remember");
    expect(createCalls[0]!.args.p_pillar_id).toBe("pillar-history-001");
    expect(createCalls[0]!.args.p_category_id).toBe("cat-ancient-cities-001");

    // 2. save_story_draft called once (with tags, sources, SEO, no cover)
    const saveCalls = mock.rpcCalls.filter((c) => c.fn === "save_story_draft");
    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0]!.args.p_cover_media_asset_id).toBeNull();
    expect(saveCalls[0]!.args.p_tag_ids).toBeDefined();
    expect(saveCalls[0]!.args.p_source_ids).toBeDefined();
    expect((saveCalls[0]!.args.p_source_ids as string[]).length).toBe(14);
    expect(saveCalls[0]!.args.p_seo_title).toBe("The City That Was Built to Remember | SubText");

    // ---- Verify source records created ----
    const sourceInserts = mock.inserts.filter((i) => i.table === "sources");
    expect(sourceInserts).toHaveLength(14);

    // Verify first source
    const firstSource = sourceInserts[0]!.data;
    expect(firstSource.title).toContain("Ishtar Gate");
    expect(firstSource.author_text).toBe("Wikipedia contributors");
    expect(firstSource.url).toContain("en.wikipedia.org");
    expect(firstSource.source_type).toBeDefined();
    expect(firstSource.created_by).toBe("admin-user-001");

    // ---- Verify media records created ----
    const mediaInserts = mock.inserts.filter((i) => i.table === "media_assets");
    expect(mediaInserts.length).toBeGreaterThanOrEqual(4);

    // All media has processing_status = 'pending', rights_status = 'unknown'
    for (const m of mediaInserts) {
      expect(m.data.processing_status).toBe("pending");
      expect(m.data.kind).toBe("image");
      expect(m.data.uploaded_by).toBe("admin-user-001");
      expect(m.data.rights_status).toBe("unknown"); // pending → unknown
      expect(m.data.checksum_sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(m.data.byte_size).toBeGreaterThan(0);
    }

    // ---- Verify storage uploads ----
    expect(mock.storageUploads.length).toBeGreaterThanOrEqual(4);
    for (const upload of mock.storageUploads) {
      expect(upload.bucket).toBe("media-originals");
      expect(upload.size).toBeGreaterThan(0);
    }

    // ---- Verify NO hero cover assigned ----
    const heroInserts = mock.inserts.filter((i) => i.table === "article_media_assets");
    expect(heroInserts).toHaveLength(0);

    // ---- Verify no rollbacks occurred ----
    expect(mock.deletes).toHaveLength(0);

    // ---- Summary ----
    console.log(`
=== E2E IMPORT RESULT ===
Article ID:       ${importResult.articleId}
Revision ID:      ${importResult.revisionId}
Sources created:  ${sourceInserts.length}
Media created:    ${mediaInserts.length} (all pending)
Storage uploads:  ${mock.storageUploads.length}
Tags:             ${(saveCalls[0]!.args.p_tag_ids as string[]).length}
Hero assigned:    NO (deferred per C1 fix)
Rollback:         NO (import succeeded)
Warnings:         ${preview.warnings.length} (incl. image_rights_unresolved)
    `);
  });

  it("article metadata is coherent", async () => {
    const parseResult = await parseStoryPackage(loadZip());
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const mock = createRealisticMock();
    createSupabaseServerClientMock.mockResolvedValue(mock.supabase);

    const result = await executeStoryImport(parseResult.pkg);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const saveCalls = mock.rpcCalls.filter((c) => c.fn === "save_story_draft");
    const args = saveCalls[0]!.args;

    expect(args.p_body_markdown).toContain("# The City That Was Built to Remember");
    expect(args.p_body_markdown).toContain("Nebuchadnezzar");
    expect(args.p_body_markdown).toContain("Vietnam Veterans Memorial");
    expect(args.p_seo_title).toBe("The City That Was Built to Remember | SubText");
    expect(args.p_seo_description).toContain("civilizations");
    expect(args.p_excerpt).toContain("Babylon");
    expect(args.p_word_count).toBeGreaterThan(1000);
    expect(args.p_reading_time_minutes).toBeGreaterThanOrEqual(5);
  });

  it("imported story markdown is the body only (no frontmatter)", async () => {
    const parseResult = await parseStoryPackage(loadZip());
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    expect(parseResult.pkg.storyMarkdown).not.toContain("---\ntitle:");
    expect(parseResult.pkg.storyMarkdown).toContain("# The City That Was Built to Remember");
  });

  it("all 6 tags are passed to save_story_draft", async () => {
    const parseResult = await parseStoryPackage(loadZip());
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const mock = createRealisticMock();
    createSupabaseServerClientMock.mockResolvedValue(mock.supabase);

    const result = await executeStoryImport(parseResult.pkg);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const saveCalls = mock.rpcCalls.filter((c) => c.fn === "save_story_draft");
    const tagIds = saveCalls[0]!.args.p_tag_ids as string[];
    expect(tagIds).toHaveLength(6);
  });

  it("no Supabase writes occur during parse", async () => {
    const parseResult = await parseStoryPackage(loadZip());
    expect(parseResult.ok).toBe(true);
    expect(createSupabaseServerClientMock).not.toHaveBeenCalled();
  });
});
