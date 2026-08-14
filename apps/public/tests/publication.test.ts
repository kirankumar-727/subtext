import { describe, expect, it } from "vitest";
import { buildRevalidationPlan, verifyProjection } from "@/lib/publication";
describe("public publication coordination", () => {
  it("creates a deterministic targeted cache, sitemap, RSS, search and redirect plan", () => {
    const plan = buildRevalidationPlan({
      articleId: "a",
      canonicalPath: "/history/new",
      pillarSlug: "history",
      categorySlug: "empires",
      redirectPaths: ["/history/old", "/history/old"],
    });
    expect(plan.paths).toEqual([
      "/history/new",
      "/history/old",
      "/",
      "/history",
      "/sitemap.xml",
      "/feed.xml",
      "/history/empires",
    ]);
    expect(plan.tags).toContain("search");
  });
  it("requires article and search projections to match", () => {
    expect(
      verifyProjection({
        action: "publish",
        expectedChecksum: "hash",
        expectedPath: "/history/story",
        article: { content_checksum: "hash", canonical_path: "/history/story" },
        search: { canonical_path: "/history/story" },
      }),
    ).toBe(true);
    expect(
      verifyProjection({
        action: "publish",
        expectedChecksum: "hash",
        expectedPath: "/history/story",
        article: null,
        search: null,
      }),
    ).toBe(false);
  });
  it("verifies unpublish only when public and search projections are absent", () => {
    expect(
      verifyProjection({
        action: "unpublish",
        expectedChecksum: null,
        expectedPath: "/history/story",
        article: null,
        search: null,
      }),
    ).toBe(true);
    expect(
      verifyProjection({
        action: "unpublish",
        expectedChecksum: null,
        expectedPath: "/history/story",
        article: { content_checksum: "hash", canonical_path: "/history/story" },
        search: null,
      }),
    ).toBe(false);
  });
});
