import { describe, expect, it, vi } from "vitest";

// #229: /line/<id> fetched the whole line context twice per request, once for
// generateMetadata and once for the page. Both now go through React's
// per-request cache(). Outside a React server render cache() doesn't memoize,
// so this test swaps in a memoizing stand-in and checks the wiring.

vi.mock("react", async (orig) => {
  const real = await orig<typeof import("react")>();
  const cache = <A extends unknown[], R>(fn: (...a: A) => R) => {
    const memo = new Map<string, R>();
    return (...a: A) => {
      const k = JSON.stringify(a);
      if (!memo.has(k)) memo.set(k, fn(...a));
      return memo.get(k)!;
    };
  };
  return { ...real, cache, default: { ...real, cache } };
});

const fetchLineContext = vi.fn(async (id: number) => ({
  lineId: id,
  lines: [{ id, gurmukhi: "ਸਤਿ ਨਾਮੁ ॥੧॥" }],
}));
vi.mock("../lib/line-context", () => ({ fetchLineContext: (...a: [number]) => fetchLineContext(...a) }));
vi.mock("../lib/curator", () => ({ curatorDb: () => null, isCurator: () => false }));
vi.mock("../components/line/LineView", () => ({ LineView: () => null }));

describe("line page reads its context once per request (#229)", () => {
  it("shares one fetch between generateMetadata and the page", async () => {
    const { lineMetadata, linePage } = await import("../components/line/linePage");
    const meta = await lineMetadata("7", "passage");
    await linePage("7", "passage");
    expect(meta.title).toContain("ਸਤਿ ਨਾਮੁ");
    expect(fetchLineContext).toHaveBeenCalledTimes(1);
  });
});
