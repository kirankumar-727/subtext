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
          <h1>
            {initialStatus
              ? `${initialStatus.slice(0, 1).toUpperCase()}${initialStatus.slice(1)}`
              : "Stories"}
          </h1>
        </div>
        <Link className="primary-action" href="/admin/stories/new">
          <span aria-hidden="true">+</span> New Story
        </Link>
      </header>
      <div className="workspace-page__subhead">
        <p>
          {stories.length
            ? `${stories.length} stories in the editorial library`
            : "Your editorial library"}
        </p>
        <span>Private workspace</span>
      </div>
      <div className="story-list-head">
        <span>Title</span>
        <span>Pillar</span>
        <span>Status</span>
        <span>Updated</span>
        <span>Published</span>
      </div>
      <StoryList initialStatus={initialStatus} pillars={pillars} stories={stories} />
    </main>
  );
}
