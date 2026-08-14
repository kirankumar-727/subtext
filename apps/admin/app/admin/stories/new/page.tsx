import { createStory } from "@/app/admin/cms-actions";
import { getWorkspaceReferenceData } from "@/lib/cms/queries";
export default async function NewStoryPage() {
  const { pillars } = await getWorkspaceReferenceData();
  return (
    <main className="workspace-page workspace-page--narrow">
      <header className="workspace-page__header">
        <div>
          <p className="workspace-eyebrow">New story</p>
          <h1>What are you exploring?</h1>
        </div>
      </header>
      <form action={createStory} className="new-story-form">
        <input autoFocus name="title" placeholder="Story title" required />
        <select defaultValue={pillars[0]?.id} name="pillarId" required>
          {pillars.map((pillar) => (
            <option key={pillar.id} value={pillar.id}>
              {pillar.name}
            </option>
          ))}
        </select>
        <button className="primary-action" type="submit">
          Start writing
        </button>
      </form>
    </main>
  );
}
