import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "@subtext/ui/styles.css";
import "./styles.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://subtext.media";
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Subtext Media — Everything has a subtext", template: "%s — Subtext Media" },
  description:
    "Research-driven documentary storytelling about history, business, psychology and society.",
  applicationName: "Subtext Media",
  alternates: { canonical: "/", types: { "application/rss+xml": "/feed.xml" } },
  openGraph: {
    type: "website",
    siteName: "Subtext Media",
    title: "Subtext Media",
    description: "Everything has a subtext.",
    url: siteUrl,
  },
  twitter: { card: "summary", title: "Subtext Media", description: "Everything has a subtext." },
  robots: { index: true, follow: true },
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
