import { MarkdownRenderer } from "@subtext/content";
import "@subtext/content/styles.css";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicImage } from "@/components/public-image";
import { StoryCard } from "@/components/story-card";
import {
  getArticleByPath,
  getArticleCitations,
  getArticleMedia,
  getPublishedArticles,
  relatedStories,
} from "@/lib/editorial";
import { buildArticleMetadata, buildArticleStructuredData } from "@/lib/seo";

export const dynamic = "force-dynamic";
type ArticlePageProps = { params: Promise<{ pillar: string; slug: string }> };
const validPillars = new Set(["history", "business", "psychology", "society"]);
function jsonLd(value: unknown) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { pillar, slug } = await params;
  if (!validPillars.has(pillar)) return {};
  const article = await getArticleByPath(pillar, slug);
  if (!article) return {};
  const media = (await getArticleMedia(article.id))
    .filter((item) => item.role === "hero")
    .sort((a, b) => b.width - a.width);
  const hero = media[0];
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://subtext.media";
  return buildArticleMetadata(article, hero, siteUrl);
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { pillar, slug } = await params;
  if (!validPillars.has(pillar)) notFound();
  const article = await getArticleByPath(pillar, slug);
  if (!article) notFound();
  const [media, citations, all] = await Promise.all([
    getArticleMedia(article.id),
    getArticleCitations(article.id),
    getPublishedArticles(),
  ]);
  const hero = media.filter((item) => item.role === "hero");
  const definitions = citations
    .filter((citation) => !article.bodyMarkdown.includes(`[^${citation.citationKey}]:`))
    .map(
      (citation) =>
        `[^${citation.citationKey}]: ${citation.citationText}${citation.url ? ` — ${citation.url}` : ""}`,
    )
    .join("\n");
  const markdown = definitions ? `${article.bodyMarkdown}\n\n${definitions}` : article.bodyMarkdown;
  const related = relatedStories(article, all);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://subtext.media";
  const { article: structured, breadcrumb } = buildArticleStructuredData(
    article,
    citations,
    hero,
    siteUrl,
  );
  return (
    <main id="main-content" className="article-page">
      <script dangerouslySetInnerHTML={{ __html: jsonLd(structured) }} type="application/ld+json" />
      <script dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }} type="application/ld+json" />
      <header className="article-header">
        <nav aria-label="Breadcrumb">
          <Link href="/">Subtext</Link>
          <span>/</span>
          <Link href={`/${article.pillarSlug}` as Route}>{article.pillarName}</Link>
        </nav>
        <p className="editorial-label">
          {article.pillarName}
          {article.categoryName ? ` · ${article.categoryName}` : ""}
        </p>
        <h1>{article.title}</h1>
        {article.dek ? <p className="article-dek">{article.dek}</p> : null}
        <div className="article-byline">
          <span>By {article.authorName}</span>
          <time dateTime={article.firstPublishedAt}>
            {new Date(article.firstPublishedAt).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </time>
          <span>{article.readingTimeMinutes} min read</span>
        </div>
      </header>
      {hero.length ? <PublicImage className="article-hero-image" priority variants={hero} /> : null}
      <div className="article-content">
        <MarkdownRenderer markdown={markdown} />
      </div>
      {citations.length ? (
        <section className="article-sources" aria-labelledby="sources-title">
          <p>Evidence</p>
          <h2 id="sources-title">Sources</h2>
          <ol>
            {citations.map((citation) => (
              <li id={`source-${citation.citationKey}`} key={citation.id}>
                <p>
                  {citation.citationText}
                  {citation.locator ? `, ${citation.locator}` : ""}
                </p>
                {citation.publicNote ? <p>{citation.publicNote}</p> : null}
                {citation.url ? (
                  <a href={citation.url} rel="noreferrer">
                    View source
                  </a>
                ) : null}
                {citation.archiveUrl ? (
                  <a href={citation.archiveUrl} rel="noreferrer">
                    Archived copy
                  </a>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {related.length ? (
        <section className="related-stories">
          <header>
            <p>Continue reading</p>
            <h2>Related stories</h2>
          </header>
          <div>
            {related.map((item) => (
              <StoryCard article={item} key={item.id} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
