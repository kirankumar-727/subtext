import path from "node:path";

import type { NextConfig } from "next";

const monorepoRoot = path.resolve(process.cwd(), "../..");

const adminHeaders = [
  { key: "Cache-Control", value: "private, no-store" },
  {
    key: "Content-Security-Policy",
    value:
      "default-src 'self'; base-uri 'self'; connect-src 'self' https://*.supabase.co http://127.0.0.1:54321 http://localhost:54321; font-src 'self'; form-action 'self'; frame-ancestors 'none'; frame-src https://www.youtube-nocookie.com https://player.vimeo.com; img-src 'self' data: blob: https://*.supabase.co http://127.0.0.1:54321 http://localhost:54321; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), microphone=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    root: monorepoRoot,
  },
  transpilePackages: ["@subtext/content", "@subtext/env", "@subtext/supabase", "@subtext/ui"],
  typedRoutes: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: adminHeaders,
      },
    ];
  },
};

export default nextConfig;
