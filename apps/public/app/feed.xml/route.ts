import { createSupabasePublicServerClient } from "@subtext/supabase/public-server";
export const dynamic = "force-dynamic";
export const revalidate = 3600;
function xml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
export async function GET() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://subtext.media";
  const supabase = createSupabasePublicServerClient();
  const { data, error } = await supabase
    .from("published_articles")
    .select("title,dek,canonical_path,last_published_at")
    .order("last_published_at", { ascending: false })
    .limit(50);
  if (error) return new Response("Feed unavailable", { status: 503 });
  const items = (data ?? [])
    .flatMap((article) => {
      if (!article.title || !article.canonical_path) return [];
      const url = new URL(article.canonical_path, siteUrl).toString();
      return [
        `<item><title>${xml(article.title)}</title><link>${xml(url)}</link><guid isPermaLink="true">${xml(url)}</guid><description>${xml(article.dek ?? "")}</description>${article.last_published_at ? `<pubDate>${new Date(article.last_published_at).toUTCString()}</pubDate>` : ""}</item>`,
      ];
    })
    .join("");
  const body = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Subtext Media</title><link>${xml(siteUrl)}</link><description>Research-driven documentary storytelling.</description>${items}</channel></rss>`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
