import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this app. Without this, Next infers the root from
  // the suite-level package-lock.json one directory up, which breaks the RSC
  // client manifest for client-component pages (home page 500s).
  turbopack: { root: __dirname },
  transpilePackages: ['@atthebunga/gurmukhi-input'],
};

export default nextConfig;
