import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@subtext/ui/styles.css";
import "./styles.css";

export const metadata: Metadata = {
  title: "Workspace — Subtext Media",
  description: "Private editorial workspace for Subtext Media.",
  robots: {
    follow: false,
    index: false,
    noarchive: true,
    nocache: true,
  },
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
