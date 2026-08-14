import Link from "next/link";
export function SiteFooter() {
  return (
    <footer className="public-footer">
      <div>
        <strong>Subtext Media</strong>
        <p>Everything has a subtext.</p>
      </div>
      <nav aria-label="Footer navigation">
        <Link href="/history">History</Link>
        <Link href="/business">Business</Link>
        <Link href="/psychology">Psychology</Link>
        <Link href="/society">Society</Link>
        <Link href="/search">Search</Link>
        <Link href="/about">About</Link>
      </nav>
      <p className="public-footer__note">Independent, research-driven documentary storytelling.</p>
    </footer>
  );
}
