import { SourceLibrary } from "@/components/source-library";
import { listSources } from "@/lib/cms/queries";

export default async function SourcesPage() {
  const sources = await listSources();

  return (
    <main className="workspace-page workspace-page--sources">
      <header className="workspace-page__header">
        <div>
          <p className="workspace-eyebrow">Research shelf</p>
          <h1>Research library</h1>
          <p className="workspace-page__lede">
            Keep the books, reporting, conversations, and evidence that let each Subtext story say
            more than it first appears to say.
          </p>
        </div>
      </header>
      <SourceLibrary sources={sources} />
    </main>
  );
}
