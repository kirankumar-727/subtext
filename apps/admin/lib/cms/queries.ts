import "server-only";

import { createSupabaseServerClient } from "@subtext/supabase/server";

import { requireAdmin } from "@/lib/auth/authorization";

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
      .eq("processing_status", "ready")
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
    media: (media.data ?? []).map((asset) => {
      const variant = variantByAsset.get(asset.id);
      const publicUrl = variant
        ? supabase.storage.from("media-public").getPublicUrl(variant.storage_key).data.publicUrl
        : null;
      return {
        ...asset,
        publicUrl,
        width: variant?.width ?? asset.width,
        height: variant?.height ?? asset.height,
      };
    }),
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
  const citations = article.current_draft_revision_id
    ? await supabase
        .from("citations")
        .select("source_id,ordinal,citation_key")
        .eq("revision_id", article.current_draft_revision_id)
        .order("ordinal")
    : { data: [], error: null };
  const hero = article.current_draft_revision_id
    ? await supabase
        .from("article_media")
        .select("media_asset_id")
        .eq("revision_id", article.current_draft_revision_id)
        .eq("role", "hero")
        .maybeSingle()
    : { data: null, error: null };
  if (citations.error || hero.error) throw new Error("Story relationships could not be loaded");
  return {
    article,
    revision: revision.data,
    tagIds: (articleTags.data ?? []).map((row) => row.tag_id),
    sourceIds: (citations.data ?? []).map((row) => row.source_id),
    coverMediaAssetId: hero.data?.media_asset_id ?? null,
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

export async function getSiteSettings() {
  await requireAdmin();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("site_settings")
    .select("key,value,description,updated_at")
    .in("key", ["brand.name", "brand.tagline"]);
  if (error) throw new Error("Settings could not be loaded");
  return Object.fromEntries((data ?? []).map((setting) => [setting.key, setting.value]));
}
