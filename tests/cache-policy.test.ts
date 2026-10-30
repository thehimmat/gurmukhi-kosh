/**
 * How long dictionary pages are cached (Oct 2026 Hobby overage: crawlers re-rendering pages whose
 * content only changes on an ingest).
 * - /word/<w> is dynamic (it reads ?tab, ?page and the curator ?key), so the CDN caches each URL
 *   through a CDN-Cache-Control header instead of ISR. Curator URLs (?key=) are never cached.
 * - /line/<id>, /line/<id>/ang and /ang/<n> are ISR and refresh weekly rather than daily.
 * Run: npm test
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DAY = 86400;

async function headerRules() {
  expect(nextConfig.headers, "next.config.ts defines headers()").toBeTypeOf("function");
  return nextConfig.headers!();
}

describe("word page CDN caching", () => {
  it("caches public /word/* responses at the CDN for at least a day, serving stale while it refreshes", async () => {
    const rule = (await headerRules()).find((r) => r.source === "/word/:path*");
    expect(rule).toBeDefined();
    const value = rule!.headers.find((h) => h.key === "CDN-Cache-Control")?.value ?? "";
    const maxAge = Number(value.match(/(?:^|[\s,])max-age=(\d+)/)?.[1] ?? 0);
    const swr = Number(value.match(/stale-while-revalidate=(\d+)/)?.[1] ?? 0);
    expect(maxAge).toBeGreaterThanOrEqual(DAY);
    expect(swr).toBeGreaterThanOrEqual(7 * DAY);
  });

  it("never caches curator URLs (?key=)", async () => {
    const rule = (await headerRules()).find((r) => r.source === "/word/:path*")!;
    expect(rule.missing).toContainEqual({ type: "query", key: "key" });
  });

  it("is the only cache rule, so nothing else (admin, API, health) is cached by accident", async () => {
    const cached = (await headerRules()).filter((r) => r.headers.some((h) => /cache-control/i.test(h.key)));
    expect(cached.map((r) => r.source)).toEqual(["/word/:path*"]);
  });
});

describe("ISR page refresh", () => {
  for (const page of ["app/line/[id]/page.tsx", "app/line/[id]/ang/page.tsx", "app/ang/[ang]/page.tsx"]) {
    it(`${page} refreshes weekly`, () => {
      const src = readFileSync(join(root, page), "utf8");
      expect(src).toMatch(/^export const revalidate = 604800;$/m);
    });
  }
});
