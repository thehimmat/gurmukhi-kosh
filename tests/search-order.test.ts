/**
 * /api/search ranks words by frequency, and many words share one. Without a tiebreak, which tied
 * words fill the last places is up to the database, so two identical databases (Supabase and the
 * self-hosted copy) returned different words for the same query. Every tier breaks ties by id, as
 * /browse does (#203).
 */
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Calls = Array<[string, unknown[]]>;
const wordQueries: Calls[] = [];

// A chainable stand-in for supabase-js that records each words query and returns no rows, so every
// tier runs.
vi.mock("../lib/supabase", () => ({
  supabase: {
    from(table: string) {
      const calls: Calls = [];
      if (table === "words") wordQueries.push(calls);
      const builder: unknown = new Proxy({}, {
        get(_, prop) {
          if (prop === "then") {
            return (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
          }
          return (...args: unknown[]) => { calls.push([String(prop), args]); return builder; };
        },
      });
      return builder;
    },
  },
}));

describe("/api/search word ranking", () => {
  it("orders every tier by frequency, then id", async () => {
    wordQueries.length = 0;
    const { GET } = await import("../app/api/search/route");
    const res = await GET(new NextRequest("http://localhost/api/search?q=ਸਤਿ"));
    expect(res.status).toBe(200);
    expect(wordQueries).toHaveLength(3); // prefix, fold, contains
    for (const calls of wordQueries) {
      expect(calls.filter(([m]) => m === "order").map(([, a]) => a)).toEqual([
        ["frequency", { ascending: false }],
        ["id", { ascending: true }],
      ]);
    }
  });
});
