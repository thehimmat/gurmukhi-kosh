import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NOTE: an earlier turbopack.root pin to this app dir was removed. It predated
  // Next 16.2.6 (RSC manifest 500s) but now breaks local workspace builds: the
  // pinned root hides suite-root-hoisted transitive deps (e.g. picocolors) from
  // the bundler. Vercel builds clone this repo standalone, so inference lands on
  // the app dir there either way.
  transpilePackages: ['@atthebunga/gurmukhi-input'],

  // Multi-zone: this app serves the dictionary paths under search.atthebunga.com
  // (the gurmukhi-search shell rewrites /word/*, /browse, /ang/*, /about, /health,
  // /admin/*, /api/word|line|flags|health here). The asset prefix keeps this zone's
  // JS/CSS/fonts from colliding with the shell's /_next/* on the shared domain.
  assetPrefix: process.env.NODE_ENV === "production" ? "/kosh-static" : undefined,

  // /admin/flags uses server actions; cross-zone POSTs arrive with the shell's
  // host, which must be allowed explicitly.
  experimental: {
    serverActions: {
      allowedOrigins: ["search.atthebunga.com", "kosh.atthebunga.com"],
    },
  },

  // /word/<w> is dynamic (it reads ?tab, ?page and the curator ?key), so it can't be ISR; let the
  // CDN cache each public URL instead. An entry changes only when an ingest runs, so a day fresh
  // and a week stale-while-revalidate matches /api/word. Next overwrites Cache-Control on dynamic
  // pages, but the CDN reads CDN-Cache-Control first. Curator URLs (?key=) are never cached.
  async headers() {
    return [
      {
        source: "/word/:path*",
        missing: [{ type: "query", key: "key" }],
        headers: [{ key: "CDN-Cache-Control", value: "max-age=86400, stale-while-revalidate=604800" }],
      },
    ];
  },
};

export default nextConfig;
