import { MediaLibrary } from "@/components/media-library";
import { listMedia } from "@/lib/cms/queries";

export default async function MediaPage() {
  const media = await listMedia();

  return (
    <main className="workspace-page workspace-page--media">
      <header className="workspace-page__header">
        <div>
          <p className="workspace-eyebrow">Publication assets</p>
          <h1>Media library</h1>
          <p className="workspace-page__lede">
            Keep the images that give Subtext its visual memory—properly credited, accessible, and
            ready when a story needs them.
          </p>
        </div>
      </header>
      <MediaLibrary media={media} />
    </main>
  );
}
