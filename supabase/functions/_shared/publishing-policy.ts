export type PublicationSnapshot = {
  action: "publish" | "republish" | "rollback" | "unpublish";
  article?: {
    id: string;
    canonical_slug: string;
    primary_pillar_id: string;
    category_id: string | null;
    current_draft_revision_id: string | null;
  } | null;
  revision?: {
    id: string;
    article_id: string;
    title: string;
    body_markdown: string;
    seo_description: string | null;
    content_checksum: string;
  } | null;
  expectedChecksum?: string | null;
  pillar?: { id: string } | null;
  category?: { id: string; pillar_id: string } | null;
  citations?: { source_id: string; is_public: boolean }[];
  sourceIds?: string[];
  media?: { processing_status: string; rights_status: string; original_storage_key: string }[];
  publicVariantAssetIds?: string[];
  mediaAssetIds?: string[];
};

export function validatePublicationSnapshot(snapshot: PublicationSnapshot): string[] {
  const issues: string[] = [];
  if (!snapshot.article) return ["article_missing"];
  if (snapshot.action === "unpublish") return issues;
  const revision = snapshot.revision;
  if (!revision) return ["revision_missing"];
  if (revision.article_id !== snapshot.article.id) issues.push("revision_article_mismatch");
  if (revision.content_checksum !== snapshot.expectedChecksum)
    issues.push("revision_checksum_mismatch");
  if (
    ["publish", "republish"].includes(snapshot.action) &&
    snapshot.article.current_draft_revision_id !== revision.id
  )
    issues.push("stale_publication_request");
  if (!revision.title.trim()) issues.push("title_missing");
  if (!snapshot.article.canonical_slug.trim()) issues.push("slug_missing");
  if (!snapshot.pillar || snapshot.pillar.id !== snapshot.article.primary_pillar_id)
    issues.push("pillar_invalid");
  if (
    snapshot.article.category_id &&
    (!snapshot.category || snapshot.category.pillar_id !== snapshot.article.primary_pillar_id)
  )
    issues.push("category_invalid");
  if (!revision.seo_description?.trim()) issues.push("seo_description_missing");
  if (/<[a-z][\s\S]*?>/i.test(revision.body_markdown)) issues.push("raw_html_unsupported");
  const unsupportedDirectives = [
    ...revision.body_markdown.matchAll(/:::+([a-z][a-z0-9_-]*)/gi),
  ].filter((match) => !["callout", "subtext", "embed"].includes(match[1]?.toLowerCase() ?? ""));
  if (unsupportedDirectives.length) issues.push("unsupported_directive");
  const publicCitations = (snapshot.citations ?? []).filter((citation) => citation.is_public);
  if (!publicCitations.length) issues.push("citations_missing");
  const knownSources = new Set(snapshot.sourceIds ?? []);
  if (publicCitations.some((citation) => !knownSources.has(citation.source_id)))
    issues.push("citation_source_missing");
  const variantAssets = new Set(snapshot.publicVariantAssetIds ?? []);
  const mediaAssetIds = snapshot.mediaAssetIds ?? [];
  if (
    (snapshot.media ?? []).some(
      (asset) =>
        asset.processing_status !== "ready" ||
        ["unknown", "restricted"].includes(asset.rights_status),
    )
  )
    issues.push("media_not_publishable");
  if (mediaAssetIds.some((assetId) => !variantAssets.has(assetId)))
    issues.push("public_media_variant_missing");
  return [...new Set(issues)];
}

export function isRetryableWorkerError(code: string, httpStatus?: number): boolean {
  if (
    ["validation_failed", "stale_publication_request", "render_rejected", "not_found"].includes(
      code,
    )
  )
    return false;
  if (httpStatus !== undefined)
    return httpStatus === 408 || httpStatus === 429 || httpStatus >= 500;
  return true;
}
