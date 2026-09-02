import Link from "next/link";

import { getDashboardData } from "@/lib/cms/queries";

function formatDate(value: string | null) {
  if (!value) return "Not published";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusLabel(status: string) {
  return status === "unpublished"
    ? "Unpublished"
    : `${status.slice(0, 1).toUpperCase()}${status.slice(1).replaceAll("_", " ")}`;
}

function EditorialStoryRow({
  showPublishedDate = false,
  story,
}: {
  showPublishedDate?: boolean;
  story: Awaited<ReturnType<typeof getDashboardData>>["stories"][number];
}) {
  return (
    <Link className="editorial-story-row" href={`/admin/stories/${story.id}`}>
      <span className="editorial-story-row__title">{story.title}</span>
      <span className="editorial-story-row__pillar">{story.pillar?.name ?? "Pillar not set"}</span>
      <span className={`status-pill status-pill--${story.status}`}>
        <span aria-hidden="true" />
        {statusLabel(story.status)}
      </span>
      <time dateTime={story.updated_at}>
        <span className="editorial-story-row__label">Updated</span>
        {formatDate(story.updated_at)}
      </time>
      {showPublishedDate ? (
        <time dateTime={story.first_published_at ?? undefined}>
          <span className="editorial-story-row__label">Published</span>
          {formatDate(story.first_published_at)}
        </time>
      ) : null}
      <span aria-hidden="true" className="editorial-story-row__arrow">
        ↗
      </span>
    </Link>
  );
}

export default async function AdminHomePage() {
  const data = await getDashboardData();

  return (
    <main className="workspace-page workspace-page--home">
      <header className="workspace-page__header home-header">
        <div>
          <p className="workspace-eyebrow">Writer workspace</p>
          <h1>Good stories start here.</h1>
          <p className="workspace-page__lede">
            A quiet place to pick up the thread, make the next edit, and send work into the world.
          </p>
        </div>
        <Link className="primary-action" href="/admin/stories/new">
          <span aria-hidden="true">+</span> New Story
        </Link>
      </header>

      <section aria-label="Publication overview" className="home-overview">
        <div className="home-overview__intro">
          <span className="workspace-section-kicker">The publication at a glance</span>
          <p>Only the work that exists in your library, nothing more.</p>
        </div>
        <div className="home-overview__counts">
          <Link href="/admin/stories?status=draft">
            <strong>{data.draftCount}</strong>
            <span>Drafts in progress</span>
          </Link>
          <Link href="/admin/stories?status=published">
            <strong>{data.publishedCount}</strong>
            <span>Published stories</span>
          </Link>
        </div>
      </section>

      {data.continueDraft ? (
        <section aria-labelledby="continue-writing-heading" className="home-continue">
          <div className="home-continue__copy">
            <span className="workspace-section-kicker">Continue writing</span>
            <h2 id="continue-writing-heading">{data.continueDraft.title}</h2>
            <p>{data.continueDraft.excerpt || "The next sentence is waiting for you."}</p>
            <div className="home-continue__meta">
              <span className={`status-pill status-pill--${data.continueDraft.status}`}>
                <span aria-hidden="true" />
                {statusLabel(data.continueDraft.status)}
              </span>
              <span>Edited {formatDate(data.continueDraft.updated_at)}</span>
              <span>{data.continueDraft.pillar?.name ?? "Pillar not set"}</span>
            </div>
          </div>
          <Link className="secondary-action" href={`/admin/stories/${data.continueDraft.id}`}>
            Resume writing <span aria-hidden="true">↗</span>
          </Link>
        </section>
      ) : (
        <section
          className="home-continue home-continue--empty"
          aria-labelledby="start-writing-heading"
        >
          <div>
            <span className="workspace-section-kicker">Begin a new thread</span>
            <h2 id="start-writing-heading">There is room for the first story.</h2>
            <p>Give an idea a title and a place in the publication.</p>
          </div>
          <Link className="secondary-action" href="/admin/stories/new">
            Start a story <span aria-hidden="true">↗</span>
          </Link>
        </section>
      )}

      <section aria-labelledby="recently-edited-heading" className="workspace-section home-section">
        <div className="section-heading">
          <div>
            <span className="workspace-section-kicker">The workbench</span>
            <h2 id="recently-edited-heading">Recently edited</h2>
          </div>
          <Link href="/admin/stories">View all stories ↗</Link>
        </div>
        {data.recentlyEdited.length ? (
          <div className="editorial-story-list">
            {data.recentlyEdited.map((story) => (
              <EditorialStoryRow key={story.id} story={story} />
            ))}
          </div>
        ) : (
          <p className="empty-state">Your edited stories will gather here.</p>
        )}
      </section>

      <section
        aria-labelledby="recently-published-heading"
        className="workspace-section home-section"
      >
        <div className="section-heading">
          <div>
            <span className="workspace-section-kicker">Out in the world</span>
            <h2 id="recently-published-heading">Recently published</h2>
          </div>
          <Link href="/admin/stories?status=published">View published ↗</Link>
        </div>
        {data.recentlyPublished.length ? (
          <div className="editorial-story-list">
            {data.recentlyPublished.map((story) => (
              <EditorialStoryRow key={story.id} showPublishedDate story={story} />
            ))}
          </div>
        ) : (
          <p className="empty-state">Published stories will appear here when they are ready.</p>
        )}
      </section>
    </main>
  );
}
