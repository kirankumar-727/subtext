export type RevalidationInput = {
  articleId: string;
  canonicalPath: string;
  pillarSlug: string;
  categorySlug: string | null;
  redirectPaths: string[];
};

export function buildRevalidationPlan(input: RevalidationInput) {
  const paths = new Set([
    input.canonicalPath,
    ...input.redirectPaths,
    "/",
    `/${input.pillarSlug}`,
    "/sitemap.xml",
    "/feed.xml",
  ]);
  if (input.categorySlug) paths.add(`/${input.pillarSlug}/${input.categorySlug}`);
  return {
    paths: [...paths],
    tags: [
      "published-articles",
      "homepage",
      "search",
      `article:${input.articleId}`,
      `pillar:${input.pillarSlug}`,
      ...(input.categorySlug ? [`category:${input.pillarSlug}:${input.categorySlug}`] : []),
    ],
  };
}

export function verifyProjection(input: {
  action: "publish" | "republish" | "rollback" | "unpublish";
  expectedChecksum: string | null;
  expectedPath: string;
  expectedRevisionId: string | null;
  expectedCitationCount: number;
  expectedMediaCount: number;
  article: { revision_id: string; content_checksum: string; canonical_path: string } | null;
  search: { revision_id: string; canonical_path: string } | null;
  citationCount: number;
  mediaCount: number;
}) {
  if (input.action === "unpublish") {
    return !input.article && !input.search && input.citationCount === 0 && input.mediaCount === 0;
  }
  return Boolean(
    input.article &&
    input.search &&
    input.article.revision_id === input.expectedRevisionId &&
    input.search.revision_id === input.expectedRevisionId &&
    input.article.content_checksum === input.expectedChecksum &&
    input.article.canonical_path === input.expectedPath &&
    input.search.canonical_path === input.expectedPath &&
    input.citationCount === input.expectedCitationCount &&
    input.mediaCount === input.expectedMediaCount,
  );
}
