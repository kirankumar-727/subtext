"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main-content" className="public-empty">
      <p className="editorial-label">Temporary interruption</p>
      <h1>The archive could not be opened.</h1>
      <p>Please try again without losing your place.</p>
      <button onClick={reset} type="button">
        Try again
      </button>
    </main>
  );
}
