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
    ],
  };
}

export function verifyProjection(input: {
  action: "publish" | "republish" | "rollback" | "unpublish";
  expectedChecksum: string | null;
  expectedPath: string;
  article: { content_checksum: string; canonical_path: string } | null;
  search: { canonical_path: string } | null;
}) {
  if (input.action === "unpublish") return !input.article && !input.search;
  return Boolean(
    input.article &&
    input.search &&
    input.article.content_checksum === input.expectedChecksum &&
    input.article.canonical_path === input.expectedPath &&
    input.search.canonical_path === input.expectedPath,
  );
}
