import { StoryPackageImporter } from "@/components/story-package-importer";

export default function ImportStoryPage() {
  return (
    <main className="workspace-page workspace-page--narrow">
      <header className="workspace-page__header">
        <div>
          <p className="workspace-eyebrow">New story</p>
          <h1>Import Story Package</h1>
          <p className="workspace-page__lede">
            Upload a SubText Story Package (.zip) or a single Markdown file (.md) to create a new
            draft. Packages are validated before import to ensure editorial integrity.
          </p>
        </div>
      </header>
      <StoryPackageImporter />
    </main>
  );
}
