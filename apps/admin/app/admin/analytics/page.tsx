export default function AnalyticsPage() {
  return (
    <main className="workspace-page workspace-page--analytics">
      <header className="workspace-page__header">
        <div>
          <p className="workspace-eyebrow">Insights / Coming soon</p>
          <h1>Analytics</h1>
        </div>
      </header>
      <section aria-labelledby="analytics-empty-title" className="analytics-empty">
        <span aria-hidden="true" className="analytics-empty__mark">
          ◌
        </span>
        <p className="workspace-eyebrow">A quieter view of the work</p>
        <h2 id="analytics-empty-title">Publication insights are not connected yet.</h2>
        <p>
          When event tracking is enabled, this space will show how published stories are being read.
          No placeholder numbers are shown here.
        </p>
      </section>
    </main>
  );
}
