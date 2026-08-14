import { BrandMark } from "@subtext/ui";
import type { Route } from "next";
import Link from "next/link";
const primary = [
  ["History", "/history"],
  ["Business", "/business"],
  ["Psychology", "/psychology"],
  ["Society", "/society"],
] as const;
export function SiteHeader() {
  return (
    <header className="public-header">
      <div className="public-header__inner">
        <BrandMark href="/" />
        <nav aria-label="Primary navigation">
          {primary.map(([label, href]) => (
            <Link href={href} key={href}>
              {label}
            </Link>
          ))}
        </nav>
        <nav aria-label="Utility navigation">
          <Link href="/search">Search</Link>
          <Link href="/about">About</Link>
        </nav>
        <details className="mobile-menu">
          <summary aria-label="Open navigation">Menu</summary>
          <div>
            {[...primary, ["Search", "/search"], ["About", "/about"]].map(([label, href]) => (
              <Link href={href as Route} key={href}>
                {label}
              </Link>
            ))}
          </div>
        </details>
      </div>
    </header>
  );
}
