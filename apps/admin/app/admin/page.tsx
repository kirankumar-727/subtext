import Link from "next/link";
import { getDashboardData } from "@/lib/cms/queries";

function StoryLink({
  story,
}: {
  story: Awaited<ReturnType<typeof getDashboardData>>["stories"][number];
}) {
  return (
    <Link className="story-row" href={`/admin/stories/${story.id}`}>
      <strong>{story.title}</strong>
      <span>{story.pillar?.name ?? "—"}</span>
      <span>{story.status.replaceAll("_", " ")}</span>
      <time>{new Date(story.updated_at).toLocaleDateString("en-IN")}</time>
    </Link>
  );
}

export default async function AdminHomePage() {
  const data = await getDashboardData();
  return (
    <main className="workspace-page">
      <header className="workspace-page__header">
        <div>
          <p className="workspace-eyebrow">Writer workspace</p>
          <h1>Good stories start here.</h1>
        </div>
        <Link className="primary-action" href="/admin/stories/new">
          New Story
        </Link>
      </header>
      <section className="workspace-counts" aria-label="Story counts">
        <div>
          <strong>{data.draftCount}</strong>
          <span>Drafts</span>
        </div>
        <div>
          <strong>{data.publishedCount}</strong>
          <span>Published</span>
        </div>
      </section>
      {data.continueDraft ? (
        <section className="workspace-section">
          <div className="section-heading">
            <h2>Continue draft</h2>
          </div>
          <StoryLink story={data.continueDraft} />
        </section>
      ) : null}
      <section className="workspace-section">
        <div className="section-heading">
          <h2>Recently edited</h2>
          <Link href="/admin/stories">View all</Link>
        </div>
        {data.recentlyEdited.length ? (
          data.recentlyEdited.map((story) => <StoryLink key={story.id} story={story} />)
        ) : (
          <p className="empty-state">Create the first Subtext story.</p>
        )}
      </section>
      <section className="workspace-section">
        <div className="section-heading">
          <h2>Recently published</h2>
        </div>
        {data.recentlyPublished.length ? (
          data.recentlyPublished.map((story) => <StoryLink key={story.id} story={story} />)
        ) : (
          <p className="empty-state">Published stories will appear here.</p>
        )}
      </section>
    </main>
  );
}
