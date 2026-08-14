import { createSupabasePublicServerClient } from "@subtext/supabase/public-server";
import type { MetadataRoute } from "next";
export const dynamic = "force-dynamic";
export const revalidate = 3600;
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://subtext.media";
  const supabase = createSupabasePublicServerClient();
  const { data } = await supabase
    .from("published_articles")
    .select("canonical_path,last_published_at")
    .order("last_published_at", { ascending: false });
  return [
    { url: siteUrl, lastModified: new Date() },
    ...(data ?? []).flatMap((article) =>
      article.canonical_path
        ? [
            {
              url: new URL(article.canonical_path, siteUrl).toString(),
              lastModified: article.last_published_at
                ? new Date(article.last_published_at)
                : undefined,
            },
          ]
        : [],
    ),
  ];
}
