import type { Metadata } from "next";
import type { PublicArticle, PublicCitation, PublicMedia } from "./editorial";

export function buildArticleMetadata(
  article: PublicArticle,
  hero: PublicMedia | undefined,
  siteUrl: string,
): Metadata {
  return {
    title: article.seoTitle ?? article.title,
    description: article.seoDescription ?? article.dek ?? undefined,
    alternates: { canonical: article.canonicalPath },
    robots: { index: true, follow: true },
    openGraph: {
      type: "article",
      url: new URL(article.canonicalPath, siteUrl),
      title: article.socialTitle ?? article.seoTitle ?? article.title,
      description: article.socialDescription ?? article.seoDescription ?? article.dek ?? undefined,
      publishedTime: article.firstPublishedAt,
      modifiedTime: article.lastPublishedAt,
      section: article.pillarName,
      tags: article.tags,
      images: hero
        ? [{ url: hero.url, width: hero.width, height: hero.height, alt: hero.altText }]
        : undefined,
    },
    twitter: {
      card: hero ? "summary_large_image" : "summary",
      title: article.socialTitle ?? article.title,
      description: article.socialDescription ?? article.seoDescription ?? article.dek ?? undefined,
      images: hero ? [hero.url] : undefined,
    },
  };
}

export function buildArticleStructuredData(
  article: PublicArticle,
  citations: PublicCitation[],
  hero: PublicMedia[],
  siteUrl: string,
) {
  return {
    article: {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: article.title,
      description: article.seoDescription ?? article.dek,
      datePublished: article.firstPublishedAt,
      dateModified: article.lastPublishedAt,
      mainEntityOfPage: new URL(article.canonicalPath, siteUrl).toString(),
      author: { "@type": "Person", name: article.authorName },
      publisher: { "@type": "Organization", name: "Subtext Media", url: siteUrl },
      articleSection: article.pillarName,
      keywords: article.tags,
      image: hero.map((item) => item.url),
      citation: citations.flatMap((citation) => (citation.url ? [citation.url] : [])),
    },
    breadcrumb: {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Subtext", item: siteUrl },
        {
          "@type": "ListItem",
          position: 2,
          name: article.pillarName,
          item: new URL(`/${article.pillarSlug}`, siteUrl).toString(),
        },
        {
          "@type": "ListItem",
          position: 3,
          name: article.title,
          item: new URL(article.canonicalPath, siteUrl).toString(),
        },
      ],
    },
  };
}
