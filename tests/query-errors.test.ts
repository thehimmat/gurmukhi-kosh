import { beforeEach, describe, expect, it, vi } from "vitest";

// #225: a failed query must reach the error page (with its retry), never read
// as "Page not found", "not indexed yet", an empty table, or hidden text.

type Result = { data: unknown; error: { message: string; code?: string } | null; count?: number | null };
type Calls = Array<[string, unknown[]]>;
let handler: (table: string, calls: Calls) => Result;

// A chainable stand-in for supabase-js: every builder method records itself,
// and awaiting the chain asks the handler for that query's result.
vi.mock("../lib/supabase", () => ({
  supabase: {
    from(table: string) {
      const calls: Calls = [];
      const builder: unknown = new Proxy({}, {
        get(_, prop) {
          if (prop === "then") {
            return (ok: (r: Result) => unknown, fail: (e: unknown) => unknown) =>
              Promise.resolve(handler(table, calls)).then(ok, fail);
          }
          return (...args: unknown[]) => { calls.push([String(prop), args]); return builder; };
        },
      });
      return builder;
    },
  },
}));

const ok = (data: unknown): Result => ({ data, error: null });
const fail = (message: string, code?: string): Result => ({ data: null, error: { message, code } });
const has = (calls: Calls, method: string, col?: string) =>
  calls.some(([m, a]) => m === method && (col === undefined || a[0] === col));

const LINE = {
  id: 1, verse_id: 1, shabad_id: 7, ang: 1, line_no: 1, gurmukhi: "ਸਤਿ", translation_en: "True",
  transliteration_en: null, source_fk: 1, vishraam: null,
  sources: { code: "sggs_banidb_v2", name: "SGGS" }, shabads: null,
};

/** A healthy database, with one table (or query) overridden. */
function db(override: (table: string, calls: Calls) => Result | undefined = () => undefined) {
  handler = (table, calls) => {
    const o = override(table, calls);
    if (o) return o;
    if (table === "lines" && has(calls, "eq", "id")) return ok(LINE);
    if (table === "lines" && has(calls, "maybeSingle")) return ok(null); // prev / next
    if (table === "lines") return ok([LINE]);
    if (table === "passages") return ok([]);
    if (table === "line_translations") return ok([{ line_id: 1, source_code: "ssk_en", language: "en", body_unicode: "SSK", caveat: null }]);
    if (table === "translation_sources") return ok([{ code: "ssk_en", name: "English translation", author: "Dr Sant Singh Khalsa" }]);
    return ok([]);
  };
}

describe("fetchLineContext", () => {
  beforeEach(() => db());

  it("returns the passage when every query succeeds", async () => {
    const { fetchLineContext } = await import("../lib/line-context");
    const ctx = await fetchLineContext(1);
    expect(ctx?.lines.map((l) => l.id)).toEqual([1]);
    expect(ctx?.sources.map((s) => s.code)).toEqual(["ssk_en", "banidb_en"]);
  });

  it("returns null only when the line truly doesn't exist", async () => {
    db((t, c) => (t === "lines" && has(c, "eq", "id") ? ok(null) : undefined));
    const { fetchLineContext } = await import("../lib/line-context");
    await expect(fetchLineContext(1)).resolves.toBeNull();
  });

  it("throws when the line query fails, instead of reading as not found", async () => {
    db((t, c) => (t === "lines" && has(c, "eq", "id") ? fail("canceling statement due to statement timeout") : undefined));
    const { fetchLineContext } = await import("../lib/line-context");
    await expect(fetchLineContext(1)).rejects.toThrow(/statement timeout/);
  });

  it("throws when the passages query fails, instead of falling back to the shabad", async () => {
    db((t) => (t === "passages" ? fail("passages down") : undefined));
    const { fetchLineContext } = await import("../lib/line-context");
    await expect(fetchLineContext(1)).rejects.toThrow(/passages down/);
  });

  it("throws when a neighbour query fails, instead of dropping the nav link", async () => {
    db((t, c) => (t === "lines" && has(c, "lt", "verse_id") ? fail("prev down") : undefined));
    const { fetchLineContext } = await import("../lib/line-context");
    await expect(fetchLineContext(1)).rejects.toThrow(/prev down/);
  });

  it("still shows every source the passage has when the source names fail to load", async () => {
    db((t) => (t === "translation_sources" ? fail("sources down") : undefined));
    const { fetchLineContext } = await import("../lib/line-context");
    const ctx = await fetchLineContext(1);
    expect(ctx?.sources.map((s) => s.code)).toEqual(["ssk_en", "banidb_en"]);
  });
});

describe("ang page", () => {
  it("throws on a failed query rather than saying the ang isn't indexed", async () => {
    db((t) => (t === "lines" ? fail("ang down") : undefined));
    const { default: AngPage } = await import("../app/ang/[ang]/page");
    await expect(AngPage({ params: Promise.resolve({ ang: "5" }) })).rejects.toThrow(/ang down/);
  });
});

describe("browse page", () => {
  it("throws on a failed query rather than showing an empty table", async () => {
    db((t) => (t === "words" ? fail("words down") : undefined));
    const { default: BrowsePage } = await import("../app/browse/page");
    await expect(BrowsePage({ searchParams: Promise.resolve({}) })).rejects.toThrow(/words down/);
  });

  it("is not found past the last page (PostgREST's range error), not an error", async () => {
    db((t) => (t === "words" ? fail("Requested range not satisfiable", "PGRST103") : undefined));
    const { default: BrowsePage } = await import("../app/browse/page");
    await expect(BrowsePage({ searchParams: Promise.resolve({ page: "9999" }) })).rejects.toMatchObject({
      digest: expect.stringMatching(/404|NOT_FOUND/),
    });
  });
});
