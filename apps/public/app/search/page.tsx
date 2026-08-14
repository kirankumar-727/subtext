import type { Metadata, Route } from "next";
import Link from "next/link";
import { searchPublished } from "@/lib/editorial";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Search",
  description: "Search published Subtext Media stories.",
  robots: { index: false, follow: true },
};
type SearchProps = { searchParams: Promise<{ q?: string; pillar?: string }> };
export default async function SearchPage({ searchParams }: SearchProps) {
  const { q = "", pillar = "" } = await searchParams;
  const results = await searchPublished(q, pillar || null);
  return (
    <main id="main-content" className="search-page">
      <header>
        <p className="editorial-label">Archive search</p>
        <h1>Find the story beneath.</h1>
      </header>
      <form action="/search" className="public-search" method="get" role="search">
        <label htmlFor="search-query">Search published stories</label>
        <div>
          <input
            autoFocus
            defaultValue={q}
            id="search-query"
            name="q"
            placeholder="History, companies, behaviour…"
          />
          <select aria-label="Filter by pillar" defaultValue={pillar} name="pillar">
            <option value="">All pillars</option>
            <option value="history">History</option>
            <option value="business">Business</option>
            <option value="psychology">Psychology</option>
            <option value="society">Society</option>
          </select>
          <button type="submit">Search</button>
        </div>
      </form>
      {q ? (
        <section className="search-results" aria-live="polite">
          <p>
            {results.length} {results.length === 1 ? "result" : "results"} for “{q}”
          </p>
          {results.map((result) => (
            <article key={result.article_id}>
              <p className="editorial-label">
                {result.pillar_name}
                {result.category_name ? ` · ${result.category_name}` : ""}
              </p>
              <h2>
                <Link href={(result.canonical_path ?? "/") as Route}>
                  {result.title ?? "Untitled"}
                </Link>
              </h2>
              {result.dek ? <p>{result.dek}</p> : null}
              <div className="editorial-meta">
                <time>
                  {result.published_at
                    ? new Date(result.published_at).toLocaleDateString("en-IN")
                    : ""}
                </time>
              </div>
            </article>
          ))}
          {!results.length ? (
            <div className="public-empty">
              <h2>No published story matched.</h2>
              <p>Try a broader subject or another pillar.</p>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="search-prompts">
          <p>Try searching for</p>
          <div>
            <Link href="/search?q=empires">Empires</Link>
            <Link href="/search?q=business+models">Business models</Link>
            <Link href="/search?q=cognitive+bias">Cognitive bias</Link>
          </div>
        </section>
      )}
    </main>
  );
}
