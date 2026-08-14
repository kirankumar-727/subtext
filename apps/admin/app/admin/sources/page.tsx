import { createSource } from "@/app/admin/cms-actions";
import { listSources } from "@/lib/cms/queries";
export default async function SourcesPage() {
  const sources = await listSources();
  return (
    <main className="workspace-page">
      <header className="workspace-page__header">
        <div>
          <p className="workspace-eyebrow">Research</p>
          <h1>Sources</h1>
        </div>
      </header>
      <section className="split-management">
        <form action={createSource} className="management-form">
          <h2>Add source</h2>
          <label>
            Type
            <select name="sourceType" defaultValue="website">
              <option value="book">Book</option>
              <option value="journal_article">Journal article</option>
              <option value="news_article">News article</option>
              <option value="website">Website</option>
              <option value="report">Report</option>
              <option value="archive">Archive</option>
              <option value="interview">Interview</option>
              <option value="dataset">Dataset</option>
              <option value="video">Video</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Title
            <input name="title" required />
          </label>
          <label>
            Author
            <input name="authorText" />
          </label>
          <label>
            Publisher
            <input name="publisher" />
          </label>
          <label>
            URL
            <input name="url" type="url" />
          </label>
          <label>
            Archive URL
            <input name="archiveUrl" type="url" />
          </label>
          <label>
            ISBN
            <input name="isbn" />
          </label>
          <label>
            DOI
            <input name="doi" />
          </label>
          <button className="primary-action" type="submit">
            Add source
          </button>
        </form>
        <div className="source-list">
          {sources.map((source) => (
            <article key={source.id}>
              <span>{source.source_type.replaceAll("_", " ")}</span>
              <strong>{source.title}</strong>
              <p>{[source.author_text, source.url].filter(Boolean).join(" · ")}</p>
            </article>
          ))}
          {!sources.length ? <p className="empty-state">No sources added yet.</p> : null}
        </div>
      </section>
    </main>
  );
}
