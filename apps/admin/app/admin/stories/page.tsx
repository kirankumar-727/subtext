import Link from "next/link";
import { StoryList } from "@/components/story-list";
import { listStories } from "@/lib/cms/queries";
export default async function StoriesPage() {
  const stories = await listStories();
  const pillars = [
    ...new Map(stories.flatMap((s) => (s.pillar ? [[s.pillar.slug, s.pillar]] : []))).values(),
  ];
  return (
    <main className="workspace-page">
      <header className="workspace-page__header">
        <div>
          <p className="workspace-eyebrow">Library</p>
          <h1>Stories</h1>
        </div>
        <Link className="primary-action" href="/admin/stories/new">
          + New Story
        </Link>
      </header>
      <div className="story-list-head">
        <span>Title</span>
        <span>Pillar</span>
        <span>Status</span>
        <span>Updated</span>
        <span>Published</span>
      </div>
      <StoryList pillars={pillars} stories={stories} />
    </main>
  );
}
