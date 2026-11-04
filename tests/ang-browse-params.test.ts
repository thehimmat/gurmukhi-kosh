import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { parseAng, parsePageNumber } from "../lib/route-params";

// #226: /ang/<n> and /browse?page=<n> took whatever parseInt made of the
// path ("12abc" → ang 12), the browse header printed a bare "0" when there
// were no words, and an ang's lines were ordered by line_no alone.

describe("parseAng", () => {
  it("accepts a plain ang number in 1..1430", () => {
    expect(parseAng("1")).toBe(1);
    expect(parseAng("1430")).toBe(1430);
  });

  it("rejects anything else", () => {
    for (const s of ["0", "1431", "-3", "12abc", "1e3", "12.5", " 12", "", "abc", "012"]) {
      expect(parseAng(s), s).toBeNull();
    }
  });
});

describe("parsePageNumber", () => {
  it("defaults to page 1 when there is no page parameter", () => {
    expect(parsePageNumber(undefined)).toBe(1);
  });

  it("accepts a positive whole number", () => {
    expect(parsePageNumber("7")).toBe(7);
  });

  it("rejects anything else", () => {
    for (const s of ["0", "-1", "2abc", "1.5", "", "x", "07"]) expect(parsePageNumber(s), s).toBeNull();
  });
});

type Result = { data: unknown; error: { message: string; code?: string } | null; count?: number | null };
type Calls = Array<[string, unknown[]]>;
let handler: (table: string, calls: Calls) => Result;
let lastCalls: Calls = [];

vi.mock("../lib/supabase", () => ({
  supabase: {
    from(table: string) {
      const calls: Calls = [];
      lastCalls = calls;
      const builder: unknown = new Proxy({}, {
        get(_, prop) {
          if (prop === "then") {
            return (ok: (r: Result) => unknown) => Promise.resolve(handler(table, calls)).then(ok);
          }
          return (...args: unknown[]) => { calls.push([String(prop), args]); return builder; };
        },
      });
      return builder;
    },
  },
}));

const notFoundDigest = { digest: expect.stringMatching(/404|NOT_FOUND/) };

describe("ang page", () => {
  beforeEach(() => { handler = () => ({ data: [], error: null }); });

  it("is not found for a path that isn't a plain ang number", async () => {
    const { default: AngPage } = await import("../app/ang/[ang]/page");
    await expect(AngPage({ params: Promise.resolve({ ang: "12abc" }) })).rejects.toMatchObject(notFoundDigest);
  });

  it("orders the ang's lines totally: line_no, then id", async () => {
    const { default: AngPage } = await import("../app/ang/[ang]/page");
    await AngPage({ params: Promise.resolve({ ang: "5" }) });
    const orders = lastCalls.filter(([m]) => m === "order").map(([, a]) => a[0]);
    expect(orders).toEqual(["line_no", "id"]);
  });
});

describe("browse page", () => {
  it("is not found for a page parameter that isn't a positive whole number", async () => {
    handler = () => ({ data: [], error: null, count: 0 });
    const { default: BrowsePage } = await import("../app/browse/page");
    await expect(BrowsePage({ searchParams: Promise.resolve({ page: "2abc" }) })).rejects.toMatchObject(notFoundDigest);
  });

  it("prints no stray 0 when there are no words", async () => {
    handler = () => ({ data: [], error: null, count: 0 });
    const { default: BrowsePage } = await import("../app/browse/page");
    const html = renderToStaticMarkup((await BrowsePage({ searchParams: Promise.resolve({}) })) as ReactElement);
    expect(html).not.toMatch(/<\/h1>0/);
  });
});
