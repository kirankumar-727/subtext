import type { Route } from "next";
import Link from "next/link";
import type { PublicArticle, PublicMedia } from "@/lib/editorial";
import { StoryCard } from "./story-card";
export function PillarSection({
  name,
  slug,
  stories,
  media,
}: {
  name: string;
  slug: string;
  stories: PublicArticle[];
  media: Map<string, PublicMedia[]>;
}) {
  if (!stories.length) return null;
  return (
    <section className={`pillar-section pillar-section--${slug}`}>
      <header>
        <p>Section</p>
        <h2>{name}</h2>
        <Link href={`/${slug}` as Route}>Explore {name}</Link>
      </header>
      <div className="pillar-section__grid">
        {stories.slice(0, 4).map((article, index) => (
          <StoryCard
            article={article}
            key={article.id}
            media={media.get(article.id)}
            size={index === 0 ? "standard" : "compact"}
          />
        ))}
      </div>
    </section>
  );
}
