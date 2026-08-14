import { getAllPublishedMedia, getFeaturedArticleIds, getPublishedArticles } from "@/lib/editorial";
import { PillarSection } from "@/components/pillar-section";
import { StoryCard } from "@/components/story-card";

export const dynamic = "force-dynamic";
const pillarSections = [
  ["History", "history"],
  ["Business", "business"],
  ["Psychology", "psychology"],
  ["Society", "society"],
] as const;

export default async function HomePage() {
  const [articles, allMedia, featuredIds] = await Promise.all([
    getPublishedArticles(),
    getAllPublishedMedia(),
    getFeaturedArticleIds(),
  ]);
  const media = new Map<string, typeof allMedia>();
  for (const item of allMedia.filter((entry) => entry.role === "hero"))
    media.set(item.articleId, [...(media.get(item.articleId) ?? []), item]);
  const curated = featuredIds
    .map((id) => articles.find((article) => article.id === id))
    .filter((article): article is NonNullable<typeof article> => Boolean(article));
  const featured = curated[0] ?? articles[0] ?? null;
  const selected = [
    ...curated.slice(1),
    ...articles.filter(
      (article) => article.id !== featured?.id && !featuredIds.includes(article.id),
    ),
  ].slice(0, 4);
  return (
    <main id="main-content">
      <section className="home-masthead">
        <p>Independent documentary publication</p>
        <h1>
          Everything has
          <br />a subtext.
        </h1>
        <p>Research-driven stories about the systems, decisions and ideas beneath the surface.</p>
      </section>
      {featured ? (
        <section className="home-feature" aria-labelledby="featured-story">
          <div className="home-feature__heading">
            <span>Featured story</span>
            <span>Selected by Subtext</span>
          </div>
          <div id="featured-story">
            <StoryCard article={featured} media={media.get(featured.id)} size="lead" />
          </div>
        </section>
      ) : (
        <section className="public-empty">
          <h2>Stories with depth are being prepared.</h2>
          <p>Subtext publishes when the research is ready—not to fill a feed.</p>
        </section>
      )}
      {selected.length ? (
        <section className="selected-stories">
          <header>
            <p>Selected stories</p>
            <h2>Read beyond the headline.</h2>
          </header>
          <div>
            {selected.map((article) => (
              <StoryCard article={article} key={article.id} media={media.get(article.id)} />
            ))}
          </div>
        </section>
      ) : null}
      {pillarSections.map(([name, slug]) => (
        <PillarSection
          key={slug}
          media={media}
          name={name}
          slug={slug}
          stories={articles.filter((article) => article.pillarSlug === slug)}
        />
      ))}
    </main>
  );
}
