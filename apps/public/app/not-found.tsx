import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main-content" className="public-empty">
      <p className="editorial-label">404</p>
      <h1>This story is not in the archive.</h1>
      <p>It may have moved, or it may not be published.</p>
      <Link className="primary-link" href="/">
        Return to Subtext
      </Link>
    </main>
  );
}
