import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteHeader } from "@/components/site-header";
import { StoryCard } from "@/components/story-card";
import type { PublicArticle } from "@/lib/editorial";
import { relatedStories } from "@/lib/editorial";
import { buildArticleMetadata, buildArticleStructuredData } from "@/lib/seo";

const article: PublicArticle = {
  id: "a",
  revisionId: "r",
  canonicalPath: "/history/story",
  canonicalSlug: "story",
  title: "A Story Beneath",
  dek: "Evidence and context.",
  bodyMarkdown: "# Story",
  readingTimeMinutes: 8,
  seoTitle: "SEO Story",
  seoDescription: "SEO description",
  socialTitle: null,
  socialDescription: null,
  contentChecksum: "hash",
  authorName: "Subtext Media",
  authorSlug: "subtext-media",
  pillarName: "History",
  pillarSlug: "history",
  categoryName: "Empires",
  categorySlug: "empires",
  tags: ["systems"],
  firstPublishedAt: "2026-08-01T00:00:00Z",
  lastPublishedAt: "2026-08-02T00:00:00Z",
};

describe("public editorial experience", () => {
  it("renders semantic, keyboard-navigable primary navigation", () => {
    const html = renderToStaticMarkup(<SiteHeader />);
    expect(html).toContain('aria-label="Primary navigation"');
    expect(html).toContain('href="/history"');
    expect(html).toContain('href="/search"');
  });
  it("renders a published story card with canonical URL and reading metadata", () => {
    const html = renderToStaticMarkup(<StoryCard article={article} />);
    expect(html).toContain('href="/history/story"');
    expect(html).toContain("8 min read");
    expect(html).toContain("<article");
  });
  it("selects related stories deterministically from taxonomy and tags", () => {
    const same = { ...article, id: "b", canonicalPath: "/history/other", canonicalSlug: "other" };
    const unrelated = {
      ...article,
      id: "c",
      pillarName: "Business",
      pillarSlug: "business",
      categoryName: null,
      categorySlug: null,
      tags: [],
    };
    expect(relatedStories(article, [unrelated, same])[0]?.id).toBe("b");
  });
  it("builds canonical, Open Graph, Article and Breadcrumb SEO data", () => {
    const metadata = buildArticleMetadata(article, undefined, "https://subtext.media");
    expect(metadata.alternates?.canonical).toBe("/history/story");
    expect(metadata.openGraph).toMatchObject({ type: "article" });
    const data = buildArticleStructuredData(article, [], [], "https://subtext.media");
    expect(data.article["@type"]).toBe("Article");
    expect(data.breadcrumb["@type"]).toBe("BreadcrumbList");
  });
});
