/**
 * The line viewer (/line/[id], #146): how a line is split into linkable
 * words, how its place is labelled per corpus, and the link into it.
 */
import { describe, it, expect } from "vitest";
import { lineHref, lineParts, placeLabel } from "../lib/line-context";

describe("lineParts", () => {
  it("links each word to its entry and keeps the spacing and dandas as text", () => {
    const parts = lineParts("ਸੋਚੈ ਸੋਚਿ ਨ ਹੋਵਈ ॥੧॥");
    expect(parts.map((p) => p.text).join("")).toBe("ਸੋਚੈ ਸੋਚਿ ਨ ਹੋਵਈ ॥੧॥");
    expect(parts.filter((p) => p.word).map((p) => p.word)).toEqual(["ਸੋਚੈ", "ਸੋਚਿ", "ਨ", "ਹੋਵਈ"]);
  });

  it("links the word, not a danda stuck to it", () => {
    const parts = lineParts("ਮਹਤੁ॥");
    expect(parts).toEqual([{ text: "ਮਹਤੁ", word: "ਮਹਤੁ" }, { text: "॥" }]);
  });

  it("leaves ੴ and verse numbers unlinked", () => {
    expect(lineParts("ੴ ॥੨॥").filter((p) => p.word)).toEqual([{ text: "ੴ", word: "ੴ" }]);
  });
});

describe("placeLabel", () => {
  it("names the ang for SGGS and the vaar for Bhai Gurdas Ji", () => {
    expect(placeLabel("sggs_banidb_v2", 12)).toBe("Ang 12");
    expect(placeLabel("bhai_gurdas_banidb_v2", 3)).toBe("Vaar 3");
    expect(placeLabel("dasam_banidb_v2", 40)).toBe("Ang 40");
  });
});

describe("lineHref", () => {
  it("opens the line's shabad scrolled to and highlighting the line", () => {
    expect(lineHref(123)).toBe("/line/123#line-123");
  });
});

// Live DB, skipped without credentials (tests/api.test.ts).
describe.skipIf(!process.env.NEXT_PUBLIC_SUPABASE_URL)("fetchLineContext (live)", () => {
  it("returns the whole shabad in reading order with its neighbours", async () => {
    const { fetchLineContext } = await import("../lib/line-context");
    // Shabad 4 opens on ang 2 at verse 31, sharing printed line 3 with the
    // end of shabad 3 (verse 30): the order must come from verse_id.
    const ctx = await fetchLineContext(32);
    expect(ctx).not.toBeNull();
    const ids = ctx!.lines.map((l) => l.id);
    expect(ids[0]).toBe(31);
    expect(ids).toContain(32);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(new Set(ctx!.lines.map((l) => l.shabad_id))).toEqual(new Set([4]));
    expect(ctx!.prevId).toBe(30);
    expect(ctx!.nextId).toBe(ids.at(-1)! + 1);
    expect(ctx!.source?.code).toBe("sggs_banidb_v2");
  });

  it("returns null for a line that doesn't exist", async () => {
    const { fetchLineContext } = await import("../lib/line-context");
    expect(await fetchLineContext(999999999)).toBeNull();
  });
});
