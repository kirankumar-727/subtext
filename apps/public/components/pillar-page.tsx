import { getAllPublishedMedia, getPublishedArticles } from "@/lib/editorial";
import { StoryCard } from "./story-card";
const copy = {
  history: {
    name: "History",
    kicker: "Civilizations leave evidence",
    description:
      "Empires, sacred places, people and systems—examined through material evidence and careful context.",
  },
  business: {
    name: "Business",
    kicker: "Follow the mechanism",
    description:
      "Companies, brands and economies understood through the hidden systems that make them work.",
  },
  psychology: {
    name: "Psychology",
    kicker: "Why people do what they do",
    description:
      "Behaviour, bias and influence explored without shortcuts, tricks or pop-science spectacle.",
  },
  society: {
    name: "Society",
    kicker: "Context for the present",
    description:
      "Important developments explained through what happened, why it matters and what sits beneath.",
  },
} as const;
export async function PillarPage({ pillar }: { pillar: keyof typeof copy }) {
  const [all, mediaRows] = await Promise.all([getPublishedArticles(), getAllPublishedMedia()]);
  const stories = all.filter((article) => article.pillarSlug === pillar);
  const media = new Map<string, typeof mediaRows>();
  for (const item of mediaRows.filter((entry) => entry.role === "hero"))
    media.set(item.articleId, [...(media.get(item.articleId) ?? []), item]);
  const [lead, ...rest] = stories;
  const categories = [...new Set(stories.map((story) => story.categoryName).filter(Boolean))];
  const info = copy[pillar];
  return (
    <main id="main-content" className={`pillar-page pillar-page--${pillar}`}>
      <header className="pillar-hero">
        <p>{info.kicker}</p>
        <h1>{info.name}</h1>
        <div>
          <p>{info.description}</p>
          <span>
            {stories.length} {stories.length === 1 ? "story" : "stories"}
          </span>
        </div>
      </header>
      {lead ? (
        <>
          <section className="pillar-lead">
            <StoryCard article={lead} media={media.get(lead.id)} size="lead" />
          </section>
          <section className="pillar-archive" aria-label={`${info.name} stories`}>
            {rest.map((article) => (
              <StoryCard article={article} key={article.id} media={media.get(article.id)} />
            ))}
          </section>
        </>
      ) : (
        <section className="public-empty">
          <h2>This archive is taking shape.</h2>
          <p>Subtext will publish here when a story has earned its place.</p>
        </section>
      )}
      {categories.length ? (
        <nav className="topic-index" aria-label={`${info.name} topics`}>
          <span>Explore topics</span>
          {categories.map((category) => (
            <span key={category}>{category}</span>
          ))}
        </nav>
      ) : null}
    </main>
  );
}
