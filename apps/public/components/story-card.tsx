import type { Route } from "next";
import Link from "next/link";
import type { PublicArticle, PublicMedia } from "@/lib/editorial";
import { PublicImage } from "./public-image";
export function StoryCard({
  article,
  media = [],
  size = "standard",
}: {
  article: PublicArticle;
  media?: PublicMedia[] | undefined;
  size?: "standard" | "lead" | "compact";
}) {
  return (
    <article className={`editorial-card editorial-card--${size}`}>
      {media.length ? (
        <Link aria-label={article.title} href={article.canonicalPath as Route}>
          <PublicImage
            className="editorial-card__image"
            priority={size === "lead"}
            variants={media}
          />
        </Link>
      ) : null}
      <div className="editorial-card__copy">
        <p className="editorial-label">
          {article.pillarName}
          {article.categoryName ? ` · ${article.categoryName}` : ""}
        </p>
        <h2>
          <Link href={article.canonicalPath as Route}>{article.title}</Link>
        </h2>
        {article.dek && size !== "compact" ? <p>{article.dek}</p> : null}
        <div className="editorial-meta">
          <span>{article.readingTimeMinutes} min read</span>
          <time dateTime={article.firstPublishedAt}>
            {new Date(article.firstPublishedAt).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </time>
        </div>
      </div>
    </article>
  );
}
