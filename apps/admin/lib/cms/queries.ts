import "server-only";

import { createSupabaseServerClient } from "@subtext/supabase/server";

import { requireAdmin } from "@/lib/auth/authorization";

import type {
  EditorialAuthor,
  EditorialCategory,
  EditorialPillar,
  EditorialTag,
  PublicationJobStatus,
  SettingsControlCenterData,
  SettingsPublicationEvent,
  SettingsPublicationJob,
  StoryMediaReadiness,
} from "@/lib/cms/types";

async function createMediaSignedUrl(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  storageKey: string,
) {
  const { data, error } = await supabase.storage
    .from("media-public")
    .createSignedUrl(storageKey, 3600);
  return error ? null : (data?.signedUrl ?? null);
}

export async function getWorkspaceReferenceData() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const [pillars, categories, tags, sources, media] = await Promise.all([
    supabase.from("pillars").select("id,name,slug").eq("is_active", true).order("sort_order"),
    supabase
      .from("categories")
      .select("id,pillar_id,name,slug")
      .eq("is_active", true)
      .order("sort_order"),
    supabase.from("tags").select("id,name,slug").eq("is_active", true).order("name"),
    supabase
      .from("sources")
      .select("id,title,author_text,publisher,source_type,url,archive_url,isbn,doi")
      .order("updated_at", { ascending: false })
      .limit(200),
    supabase
      .from("media_assets")
      .select(
        "id,kind,original_filename,mime_type,byte_size,width,height,default_alt_text,default_caption,credit_text,rights_status,processing_status,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  for (const result of [pillars, categories, tags, sources, media]) {
    if (result.error) throw new Error("Workspace reference data could not be loaded");
  }
  const mediaIds = (media.data ?? []).map((item) => item.id);
  const variants = mediaIds.length
    ? await supabase
        .from("media_variants")
        .select("media_asset_id,storage_key,width,height")
        .in("media_asset_id", mediaIds)
        .eq("is_public", true)
        .order("width")
    : { data: [], error: null };
  if (variants.error) throw new Error("Media derivatives could not be loaded");
  const variantByAsset = new Map<
    string,
    { storage_key: string; width: number | null; height: number | null }
  >();
  for (const variant of variants.data ?? []) {
    if (!variantByAsset.has(variant.media_asset_id))
      variantByAsset.set(variant.media_asset_id, variant);
  }
  return {
    pillars: pillars.data ?? [],
    categories: categories.data ?? [],
    tags: tags.data ?? [],
    sources: sources.data ?? [],
    media: await Promise.all(
      (media.data ?? []).map(async (asset) => {
        const variant = variantByAsset.get(asset.id);
        const publicUrl = variant
          ? await createMediaSignedUrl(supabase, variant.storage_key)
          : null;
        return {
          ...asset,
          publicUrl,
          hasPublicVariant: Boolean(variant),
          width: variant?.width ?? asset.width,
          height: variant?.height ?? asset.height,
        };
      }),
    ),
  };
}

export async function getEditorialStructureData() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const [pillarsResult, categoriesResult, tagsResult, authorsResult] = await Promise.all([
    supabase
      .from("pillars")
      .select("id,name,slug,description,sort_order,is_active,created_at,updated_at")
      .order("sort_order")
      .order("name"),
    supabase
      .from("categories")
      .select("id,pillar_id,name,slug,description,sort_order,is_active,created_at,updated_at")
      .order("pillar_id")
      .order("sort_order")
      .order("name"),
    supabase
      .from("tags")
      .select("id,name,slug,description,is_active,created_at,updated_at")
      .order("name"),
    supabase
      .from("authors")
      .select(
        "id,name,slug,bio_markdown,bio_plain_text,website_url,avatar_media_asset_id,is_active,created_at,updated_at",
      )
      .order("name"),
  ]);

  if (pillarsResult.error || categoriesResult.error || tagsResult.error || authorsResult.error) {
    throw new Error("Editorial structure could not be loaded");
  }

  const tags = tagsResult.data ?? [];
  const authors = authorsResult.data ?? [];
  const [tagUsageResults, authorStoryResults] = await Promise.all([
    Promise.all(
      tags.map((tag) =>
        supabase
          .from("article_tags")
          .select("tag_id", { count: "exact", head: true })
          .eq("tag_id", tag.id),
      ),
    ),
    Promise.all(
      authors.map((author) =>
        supabase
          .from("articles")
          .select("id", { count: "exact", head: true })
          .eq("author_id", author.id),
      ),
    ),
  ]);

  const tagUsage = new Map(
    tags.map((tag, index) => [
      tag.id,
      tagUsageResults[index]?.error ? null : (tagUsageResults[index]?.count ?? 0),
    ]),
  );
  const authorStoryCounts = new Map(
    authors.map((author, index) => [
      author.id,
      authorStoryResults[index]?.error ? null : (authorStoryResults[index]?.count ?? 0),
    ]),
  );

  return {
    pillars: (pillarsResult.data ?? []) as EditorialPillar[],
    categories: (categoriesResult.data ?? []) as EditorialCategory[],
    tags: tags.map((tag): EditorialTag => ({
      ...tag,
      usageCount: tagUsage.get(tag.id) ?? null,
    })),
    authors: authors.map((author): EditorialAuthor => ({
      ...author,
      storyCount: authorStoryCounts.get(author.id) ?? null,
    })),
  };
}

export async function listStories() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data: articles, error } = await supabase
    .from("articles")
    .select(
      "id,primary_pillar_id,status,current_draft_revision_id,published_revision_id,updated_at,first_published_at,last_published_at,canonical_path",
    )
    .order("updated_at", { ascending: false })
    .limit(250);
  if (error) throw new Error("Stories could not be loaded");
  const revisionIds = [
    ...new Set(
      (articles ?? [])
        .flatMap((article) => [article.current_draft_revision_id, article.published_revision_id])
        .filter(Boolean),
    ),
  ] as string[];
  const pillarIds = [...new Set((articles ?? []).map((article) => article.primary_pillar_id))];
  const [revisions, pillars] = await Promise.all([
    revisionIds.length
      ? supabase.from("article_revisions").select("id,title,dek").in("id", revisionIds)
      : Promise.resolve({ data: [], error: null }),
    pillarIds.length
      ? supabase.from("pillars").select("id,name,slug").in("id", pillarIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (revisions.error || pillars.error) throw new Error("Story metadata could not be loaded");
  const revisionMap = new Map((revisions.data ?? []).map((revision) => [revision.id, revision]));
  const pillarMap = new Map((pillars.data ?? []).map((pillar) => [pillar.id, pillar]));
  return (articles ?? []).map((article) => ({
    ...article,
    title:
      revisionMap.get(article.current_draft_revision_id ?? article.published_revision_id ?? "")
        ?.title ?? "Untitled",
    excerpt: revisionMap.get(article.current_draft_revision_id ?? "")?.dek ?? null,
    pillar: pillarMap.get(article.primary_pillar_id) ?? null,
  }));
}

export async function getDashboardData() {
  const stories = await listStories();
  return {
    stories,
    continueDraft: stories.find((story) => ["draft", "unpublished"].includes(story.status)) ?? null,
    recentlyEdited: stories.slice(0, 5),
    recentlyPublished: stories.filter((story) => story.status === "published").slice(0, 5),
    draftCount: stories.filter((story) => ["draft", "unpublished"].includes(story.status)).length,
    publishedCount: stories.filter((story) => story.status === "published").length,
  };
}

export async function getStory(articleId: string) {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data: article, error } = await supabase
    .from("articles")
    .select("*")
    .eq("id", articleId)
    .single();
  if (error || !article) return null;
  const [revision, articleTags, revisions, jobs] = await Promise.all([
    article.current_draft_revision_id
      ? supabase
          .from("article_revisions")
          .select("*")
          .eq("id", article.current_draft_revision_id)
          .single()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("article_tags").select("tag_id").eq("article_id", articleId),
    supabase
      .from("article_revisions")
      .select("id,revision_number,revision_kind,title,created_at,content_checksum")
      .eq("article_id", articleId)
      .order("revision_number", { ascending: false })
      .limit(30),
    supabase
      .from("publication_jobs")
      .select("id,status,action,target_revision_id,created_at,error_code")
      .eq("article_id", articleId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  if (revision.error || articleTags.error || revisions.error || jobs.error)
    throw new Error("Story could not be loaded");
  const [citations, mediaPlacements] = await Promise.all([
    article.current_draft_revision_id
      ? supabase
          .from("citations")
          .select("source_id,ordinal,citation_key,is_public")
          .eq("revision_id", article.current_draft_revision_id)
          .order("ordinal")
      : Promise.resolve({ data: [], error: null }),
    article.current_draft_revision_id
      ? supabase
          .from("article_media")
          .select("media_asset_id,role,alt_text")
          .eq("revision_id", article.current_draft_revision_id)
          .order("role")
          .order("position")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (citations.error || mediaPlacements.error)
    throw new Error("Story relationships could not be loaded");

  const mediaAssetIds = [...new Set((mediaPlacements.data ?? []).map((row) => row.media_asset_id))];
  const [mediaAssets, mediaVariants] = await Promise.all([
    mediaAssetIds.length
      ? supabase
          .from("media_assets")
          .select("id,kind,processing_status,rights_status,default_alt_text")
          .in("id", mediaAssetIds)
      : Promise.resolve({ data: [], error: null }),
    mediaAssetIds.length
      ? supabase
          .from("media_variants")
          .select("media_asset_id")
          .in("media_asset_id", mediaAssetIds)
          .eq("is_public", true)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (mediaAssets.error || mediaVariants.error)
    throw new Error("Story media readiness could not be loaded");

  const categoryResult = article.category_id
    ? await supabase
        .from("categories")
        .select("id,pillar_id")
        .eq("id", article.category_id)
        .maybeSingle()
    : { data: null, error: null };
  if (categoryResult.error) throw new Error("Story taxonomy readiness could not be loaded");

  const mediaById = new Map((mediaAssets.data ?? []).map((asset) => [asset.id, asset]));
  const publicVariantIds = new Set(
    (mediaVariants.data ?? []).map((variant) => variant.media_asset_id),
  );
  const readinessMedia = (mediaPlacements.data ?? []).flatMap(
    (placement): StoryMediaReadiness[] => {
      const asset = mediaById.get(placement.media_asset_id);
      if (!asset) return [];
      return [
        {
          mediaAssetId: placement.media_asset_id,
          role: placement.role,
          placementAltText: placement.alt_text,
          kind: asset.kind,
          processingStatus: asset.processing_status,
          rightsStatus: asset.rights_status,
          defaultAltText: asset.default_alt_text,
          hasPublicVariant: publicVariantIds.has(placement.media_asset_id),
        },
      ];
    },
  );

  return {
    article,
    revision: revision.data,
    tagIds: (articleTags.data ?? []).map((row) => row.tag_id),
    sourceIds: (citations.data ?? []).map((row) => row.source_id),
    coverMediaAssetId:
      (mediaPlacements.data ?? []).find((placement) => placement.role === "hero")?.media_asset_id ??
      null,
    readiness: {
      revisionId: article.current_draft_revision_id,
      categoryPillarId: categoryResult.data?.pillar_id ?? null,
      categoryIsKnown: !article.category_id || Boolean(categoryResult.data),
      media: readinessMedia,
      publicCitationCount: (citations.data ?? []).filter((citation) => citation.is_public).length,
    },
    revisions: revisions.data ?? [],
    jobs: jobs.data ?? [],
  };
}

export async function listMedia() {
  const data = await getWorkspaceReferenceData();
  return data.media;
}

export async function listSources() {
  const data = await getWorkspaceReferenceData();
  return data.sources;
}

export type WorkspaceReferenceData = Awaited<ReturnType<typeof getWorkspaceReferenceData>>;
export type StoryData = NonNullable<Awaited<ReturnType<typeof getStory>>>;

const supportedSiteSettingKeys = ["brand.name", "brand.tagline"] as const;
const publicationJobStatuses: PublicationJobStatus[] = [
  "queued",
  "processing",
  "committed",
  "verifying",
  "succeeded",
  "failed",
  "dead_letter",
  "cancelled",
];
const publicationFailureStatuses: PublicationJobStatus[] = ["failed", "dead_letter"];

type SiteSettingRow = {
  key: string;
  value: unknown;
  updated_at: string;
};

function settingText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function mapSettingsPublicationJob(row: {
  action: SettingsPublicationJob["action"];
  status: SettingsPublicationJob["status"];
  attempt_count: number;
  max_attempts: number;
  error_code: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}): SettingsPublicationJob {
  return {
    action: row.action,
    status: row.status,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    errorCode: row.error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function mapSettingsPublicationEvent(row: {
  level: SettingsPublicationEvent["level"];
  step: string;
  message: string;
  occurred_at: string;
}): SettingsPublicationEvent {
  return {
    level: row.level,
    step: row.step,
    message: row.message,
    occurredAt: row.occurred_at,
  };
}

export async function getSiteSettings() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("site_settings")
    .select("key,value,description,updated_at")
    .in("key", [...supportedSiteSettingKeys]);
  if (error) throw new Error("Settings could not be loaded");
  return Object.fromEntries((data ?? []).map((setting) => [setting.key, setting.value]));
}

export async function getSettingsControlCenterData(): Promise<SettingsControlCenterData> {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const [
    settingsResult,
    publicationCountResults,
    latestJobResult,
    latestSuccessfulResult,
    latestFailedResult,
    latestEventResult,
    mediaCountResults,
  ] = await Promise.all([
    supabase
      .from("site_settings")
      .select("key,value,updated_at")
      .in("key", [...supportedSiteSettingKeys]),
    Promise.all(
      publicationJobStatuses.map((status) =>
        supabase
          .from("publication_jobs")
          .select("id", { count: "exact", head: true })
          .eq("status", status),
      ),
    ),
    supabase
      .from("publication_jobs")
      .select(
        "action,status,attempt_count,max_attempts,error_code,created_at,updated_at,completed_at",
      )
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("publication_jobs")
      .select(
        "action,status,attempt_count,max_attempts,error_code,created_at,updated_at,completed_at",
      )
      .eq("status", "succeeded")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("publication_jobs")
      .select(
        "action,status,attempt_count,max_attempts,error_code,created_at,updated_at,completed_at",
      )
      .in("status", publicationFailureStatuses)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("publication_events")
      .select("level,step,message,occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    Promise.all([
      supabase.from("media_assets").select("id", { count: "exact", head: true }),
      supabase
        .from("media_assets")
        .select("id", { count: "exact", head: true })
        .eq("processing_status", "ready"),
      supabase
        .from("media_assets")
        .select("id", { count: "exact", head: true })
        .eq("processing_status", "failed"),
      supabase
        .from("media_assets")
        .select("id", { count: "exact", head: true })
        .in("rights_status", ["unknown", "restricted"]),
      supabase
        .from("media_variants")
        .select("id", { count: "exact", head: true })
        .eq("is_public", true),
    ]),
  ]);

  if (settingsResult.error) throw new Error("Settings could not be loaded");

  const settings = new Map(
    (settingsResult.data as SiteSettingRow[] | null | undefined)?.map((setting) => [
      setting.key,
      setting,
    ]) ?? [],
  );
  const nameSetting = settings.get("brand.name");
  const taglineSetting = settings.get("brand.tagline");
  const settingDates = [nameSetting?.updated_at, taglineSetting?.updated_at].filter(
    (value): value is string => Boolean(value),
  );

  const publicationResults = [
    ...publicationCountResults,
    latestJobResult,
    latestSuccessfulResult,
    latestFailedResult,
    latestEventResult,
  ];
  const publicationAvailable = publicationResults.every((result) => !result.error);
  const counts = publicationAvailable
    ? Object.fromEntries(
        publicationJobStatuses.map((status, index) => [
          status,
          publicationCountResults[index]?.count ?? 0,
        ]),
      )
    : {};
  const mediaAvailable = mediaCountResults.every((result) => !result.error);

  return {
    publication: {
      name: settingText(nameSetting?.value, "Subtext Media"),
      tagline: settingText(taglineSetting?.value, "Everything has a subtext."),
      updatedAt: settingDates.sort().at(-1) ?? null,
    },
    publishing: {
      available: publicationAvailable,
      counts,
      latestJob: latestJobResult.data ? mapSettingsPublicationJob(latestJobResult.data) : null,
      latestSuccessfulJob: latestSuccessfulResult.data
        ? mapSettingsPublicationJob(latestSuccessfulResult.data)
        : null,
      latestFailedJob: latestFailedResult.data
        ? mapSettingsPublicationJob(latestFailedResult.data)
        : null,
      latestEvent: latestEventResult.data
        ? mapSettingsPublicationEvent(latestEventResult.data)
        : null,
    },
    media: {
      available: mediaAvailable,
      totalAssets: mediaCountResults[0]?.count ?? null,
      readyAssets: mediaCountResults[1]?.count ?? null,
      failedAssets: mediaCountResults[2]?.count ?? null,
      assetsRequiringRightsReview: mediaCountResults[3]?.count ?? null,
      publicVariants: mediaCountResults[4]?.count ?? null,
    },
  };
}
