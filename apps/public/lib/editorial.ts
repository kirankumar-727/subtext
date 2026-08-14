import "server-only";
import { createSupabasePublicServerClient } from "@subtext/supabase/public-server";
import { unstable_cache } from "next/cache";

export type PublicArticle = {
  id: string;
  revisionId: string;
  canonicalPath: string;
  canonicalSlug: string;
  title: string;
  dek: string | null;
  bodyMarkdown: string;
  readingTimeMinutes: number;
  seoTitle: string | null;
  seoDescription: string | null;
  socialTitle: string | null;
  socialDescription: string | null;
  contentChecksum: string;
  authorName: string;
  authorSlug: string;
  pillarName: string;
  pillarSlug: string;
  categoryName: string | null;
  categorySlug: string | null;
  tags: string[];
  firstPublishedAt: string;
  lastPublishedAt: string;
};
export type PublicMedia = {
  articleId: string;
  role: string;
  position: number;
  altText: string;
  caption: string | null;
  creditText: string | null;
  assetId: string;
  variantName: string;
  url: string;
  width: number;
  height: number;
  mimeType: string;
};
export type PublicCitation = {
  id: string;
  articleId: string;
  ordinal: number;
  citationKey: string;
  citationText: string;
  locator: string | null;
  publicNote: string | null;
  quotedText: string | null;
  sourceTitle: string;
  authorText: string | null;
  publisher: string | null;
  publicationDate: string | null;
  url: string | null;
  archiveUrl: string | null;
  accessedAt: string | null;
};

function articleFromRow(row: Record<string, unknown>): PublicArticle | null {
  const required = [
    "id",
    "revision_id",
    "canonical_path",
    "canonical_slug",
    "title",
    "body_markdown",
    "content_checksum",
    "author_name",
    "author_slug",
    "pillar_name",
    "pillar_slug",
    "first_published_at",
    "last_published_at",
  ];
  if (required.some((key) => typeof row[key] !== "string")) return null;
  return {
    id: row.id as string,
    revisionId: row.revision_id as string,
    canonicalPath: row.canonical_path as string,
    canonicalSlug: row.canonical_slug as string,
    title: row.title as string,
    dek: typeof row.dek === "string" ? row.dek : null,
    bodyMarkdown: row.body_markdown as string,
    readingTimeMinutes: typeof row.reading_time_minutes === "number" ? row.reading_time_minutes : 1,
    seoTitle: typeof row.seo_title === "string" ? row.seo_title : null,
    seoDescription: typeof row.seo_description === "string" ? row.seo_description : null,
    socialTitle: typeof row.social_title === "string" ? row.social_title : null,
    socialDescription: typeof row.social_description === "string" ? row.social_description : null,
    contentChecksum: row.content_checksum as string,
    authorName: row.author_name as string,
    authorSlug: row.author_slug as string,
    pillarName: row.pillar_name as string,
    pillarSlug: row.pillar_slug as string,
    categoryName: typeof row.category_name === "string" ? row.category_name : null,
    categorySlug: typeof row.category_slug === "string" ? row.category_slug : null,
    tags: Array.isArray(row.tags)
      ? row.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    firstPublishedAt: row.first_published_at as string,
    lastPublishedAt: row.last_published_at as string,
  };
}

const loadArticles = unstable_cache(
  async () => {
    const supabase = createSupabasePublicServerClient();
    const { data, error } = await supabase
      .from("published_articles")
      .select("*")
      .order("last_published_at", { ascending: false });
    if (error) throw new Error("Published stories unavailable");
    return (data ?? [])
      .map((row) => articleFromRow(row as Record<string, unknown>))
      .filter((row): row is PublicArticle => Boolean(row));
  },
  ["public-articles"],
  { tags: ["published-articles"], revalidate: 3600 },
);
export async function getPublishedArticles() {
  return loadArticles();
}
export async function getArticleByPath(pillar: string, slug: string) {
  return (
    (await loadArticles()).find(
      (article) => article.pillarSlug === pillar && article.canonicalSlug === slug,
    ) ?? null
  );
}

const loadMedia = unstable_cache(
  async () => {
    const supabase = createSupabasePublicServerClient();
    const { data, error } = await supabase.from("published_media").select("*");
    if (error) throw new Error("Published media unavailable");
    return (data ?? []).flatMap((row) => {
      if (
        !row.article_id ||
        !row.media_asset_id ||
        !row.variant_name ||
        !row.storage_key ||
        !row.mime_type ||
        !row.width ||
        !row.height
      )
        return [];
      return [
        {
          articleId: row.article_id,
          role: row.role ?? "inline",
          position: row.position ?? 0,
          altText: row.alt_text ?? "",
          caption: row.caption ?? null,
          creditText: row.credit_text ?? null,
          assetId: row.media_asset_id,
          variantName: row.variant_name,
          url: supabase.storage.from("media-public").getPublicUrl(row.storage_key).data.publicUrl,
          width: row.width,
          height: row.height,
          mimeType: row.mime_type,
        } satisfies PublicMedia,
      ];
    });
  },
  ["public-media"],
  { tags: ["published-articles"], revalidate: 3600 },
);
export async function getAllPublishedMedia() {
  return loadMedia();
}
export async function getArticleMedia(articleId: string) {
  return (await loadMedia()).filter((item) => item.articleId === articleId);
}

const loadCitations = unstable_cache(
  async () => {
    const supabase = createSupabasePublicServerClient();
    const { data, error } = await supabase.from("published_citations").select("*").order("ordinal");
    if (error) throw new Error("Published citations unavailable");
    return (data ?? []).flatMap((row) => {
      if (
        !row.id ||
        !row.article_id ||
        !row.ordinal ||
        !row.citation_key ||
        !row.citation_text ||
        !row.source_title
      )
        return [];
      return [
        {
          id: row.id,
          articleId: row.article_id,
          ordinal: row.ordinal,
          citationKey: row.citation_key,
          citationText: row.citation_text,
          locator: row.locator ?? null,
          publicNote: row.public_note ?? null,
          quotedText: row.quoted_text ?? null,
          sourceTitle: row.source_title,
          authorText: row.author_text ?? null,
          publisher: row.publisher ?? null,
          publicationDate: row.publication_date ?? null,
          url: row.url ?? null,
          archiveUrl: row.archive_url ?? null,
          accessedAt: row.accessed_at ?? null,
        } satisfies PublicCitation,
      ];
    });
  },
  ["public-citations"],
  { tags: ["published-articles"], revalidate: 3600 },
);
export async function getArticleCitations(articleId: string) {
  return (await loadCitations()).filter((item) => item.articleId === articleId);
}

const loadFeaturedArticleIds = unstable_cache(
  async () => {
    const supabase = createSupabasePublicServerClient();
    const { data } = await supabase
      .from("published_featured_collections")
      .select("id,article_id,position")
      .order("position");
    if (!data?.length) return [];
    const first = data[0]?.id;
    return data
      .filter((item) => item.id === first && item.article_id)
      .map((item) => item.article_id as string);
  },
  ["featured-articles"],
  { tags: ["homepage", "published-articles"], revalidate: 3600 },
);
export async function getFeaturedArticleIds() {
  return loadFeaturedArticleIds();
}

export async function searchPublished(query: string, pillar: string | null) {
  if (!query.trim()) return [];
  const supabase = createSupabasePublicServerClient();
  const { data, error } = await supabase.rpc("search_published_articles", {
    search_query: query,
    pillar_slug: pillar,
    result_limit: 40,
    result_offset: 0,
  });
  if (error) return [];
  return data ?? [];
}

export function relatedStories(article: PublicArticle, all: PublicArticle[], limit = 3) {
  return all
    .filter((item) => item.id !== article.id)
    .map((item) => ({
      item,
      score:
        (item.pillarSlug === article.pillarSlug ? 4 : 0) +
        (item.categorySlug && item.categorySlug === article.categorySlug ? 3 : 0) +
        item.tags.filter((tag) => article.tags.includes(tag)).length * 2,
    }))
    .filter(({ score }) => score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Date.parse(b.item.lastPublishedAt) - Date.parse(a.item.lastPublishedAt),
    )
    .slice(0, limit)
    .map(({ item }) => item);
}
