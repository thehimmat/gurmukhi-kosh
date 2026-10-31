import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NOTE: an earlier turbopack.root pin to this app dir was removed. It predated
  // Next 16.2.6 (RSC manifest 500s) but now breaks local workspace builds: the
  // pinned root hides suite-root-hoisted transitive deps (e.g. picocolors) from
  // the bundler. Vercel builds clone this repo standalone, so inference lands on
  // the app dir there either way.
  transpilePackages: ['@atthebunga/gurmukhi-input'],

  // The VM runs this as a Docker image (Dockerfile, selfhost/docker-compose.apps.yml). Vercel
  // ignores the setting.
  output: "standalone",

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
  // After the move to the VM, crawlers that know gurmukhi-kosh.vercel.app still cost Vercel CPU.
  // KOSH_REDIRECT_VERCEL_HOST=1 (Vercel production only) sends them to the public site; a routing
  // redirect, so no function runs. Off by default and while rolling back: the shell on Vercel
  // reaches this zone through that host. Read per call, so tests can set it.
  async redirects() {
    if (process.env.VERCEL_ENV !== "production" || process.env.KOSH_REDIRECT_VERCEL_HOST !== "1") return [];
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "gurmukhi-kosh.vercel.app" }],
        destination: "https://search.atthebunga.com/:path*",
        permanent: true,
      },
    ];
  },

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
