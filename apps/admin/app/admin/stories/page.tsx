import Link from "next/link";

import { StoryList } from "@/components/story-list";
import { listStories } from "@/lib/cms/queries";

type StoriesPageProps = Readonly<{
  searchParams?: Promise<{ status?: string | string[] }>;
}>;

const supportedStatuses = new Set(["draft", "published", "unpublished"]);

export default async function StoriesPage({ searchParams }: StoriesPageProps) {
  const stories = await listStories();
  const params: { status?: string | string[] } = searchParams ? await searchParams : {};
  const requestedStatus = Array.isArray(params.status) ? params.status[0] : params.status;
  const initialStatus =
    requestedStatus && supportedStatuses.has(requestedStatus) ? requestedStatus : "";
  const pillars = [
    ...new Map(
      stories.flatMap((story) => (story.pillar ? [[story.pillar.slug, story.pillar]] : [])),
    ).values(),
  ];

  return (
    <main className="workspace-page workspace-page--stories">
      <header className="workspace-page__header">
        <div>
          <p className="workspace-eyebrow">Library / {initialStatus || "All stories"}</p>
          <h1>Stories</h1>
          <p className="workspace-page__lede">
            Every draft and published piece in one calm editorial shelf. Search the title, then open
            the row when it is time to work.
          </p>
        </div>
        <Link className="primary-action" href="/admin/stories/new">
          <span aria-hidden="true">+</span> New Story
        </Link>
      </header>
      <div className="workspace-page__subhead">
        <p>
          {stories.length
            ? `${stories.length} ${stories.length === 1 ? "story" : "stories"} in the editorial library`
            : "Your editorial library"}
        </p>
        <span>Private workspace · {initialStatus ? `${initialStatus} view` : "all work"}</span>
      </div>
      <div className="story-list-head" aria-hidden="true">
        <span>Title</span>
        <span>Pillar</span>
        <span>Status</span>
        <span>Updated</span>
        <span>Published</span>
        <span />
      </div>
      <StoryList initialStatus={initialStatus} pillars={pillars} stories={stories} />
    </main>
  );
}
