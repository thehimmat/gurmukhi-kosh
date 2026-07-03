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
  // /admin/*, /api/word|flags|health here). The asset prefix keeps this zone's
  // JS/CSS/fonts from colliding with the shell's /_next/* on the shared domain.
  assetPrefix: process.env.NODE_ENV === "production" ? "/kosh-static" : undefined,

  // /admin/flags uses server actions; cross-zone POSTs arrive with the shell's
  // host, which must be allowed explicitly.
  experimental: {
    serverActions: {
      allowedOrigins: ["search.atthebunga.com", "kosh.atthebunga.com"],
    },
  },
};

export default nextConfig;
