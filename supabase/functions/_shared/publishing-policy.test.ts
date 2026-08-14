import { isRetryableWorkerError, validatePublicationSnapshot } from "./publishing-policy.ts";
function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const valid = {
  action: "publish" as const,
  article: {
    id: "a",
    canonical_slug: "story",
    primary_pillar_id: "p",
    category_id: "c",
    current_draft_revision_id: "r",
  },
  revision: {
    id: "r",
    article_id: "a",
    title: "Story",
    body_markdown: "# Story\n\nSafe.",
    seo_description: "Description",
    content_checksum: "hash",
  },
  expectedChecksum: "hash",
  pillar: { id: "p" },
  category: { id: "c", pillar_id: "p" },
  citations: [{ source_id: "s", is_public: true }],
  sourceIds: ["s"],
  media: [],
  mediaAssetIds: [],
  publicVariantAssetIds: [],
};
Deno.test("valid publication snapshot passes", () => equal(validatePublicationSnapshot(valid), []));
Deno.test("draft isolation and stale targets fail", () =>
  equal(
    validatePublicationSnapshot({
      ...valid,
      article: { ...valid.article, current_draft_revision_id: "newer" },
    }),
    ["stale_publication_request"],
  ),
);
Deno.test("unsafe HTML, citations, and media are rejected", () => {
  const issues = validatePublicationSnapshot({
    ...valid,
    revision: { ...valid.revision, body_markdown: "<script>x</script>" },
    citations: [],
    media: [
      {
        processing_status: "failed",
        rights_status: "unknown",
        original_storage_key: "private/original",
      },
    ],
    mediaAssetIds: ["m"],
    publicVariantAssetIds: [],
  });
  for (const issue of [
    "raw_html_unsupported",
    "citations_missing",
    "media_not_publishable",
    "public_media_variant_missing",
  ])
    if (!issues.includes(issue)) throw new Error(`Missing ${issue}`);
});
Deno.test("network and server failures retry but validation does not", () => {
  equal(isRetryableWorkerError("validation_failed"), false);
  equal(isRetryableWorkerError("public_api_failure", 503), true);
  equal(isRetryableWorkerError("public_api_failure", 422), false);
});
