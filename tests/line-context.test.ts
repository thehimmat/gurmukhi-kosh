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
    // Commentaries come with the shabad, Sahib Singh first.
    expect(ctx!.commentaries.get(32)?.[0]?.source_code).toBe("ss_darpan");
    expect(ctx!.commentarySources[0]?.code).toBe("ss_darpan");
  });

  it("returns null for a line that doesn't exist", async () => {
    const { fetchLineContext } = await import("../lib/line-context");
    expect(await fetchLineContext(999999999)).toBeNull();
  });
});

describe("commentariesByLine", () => {
  it("groups each line's commentaries in reading order: Sahib Singh first, Faridkot last", async () => {
    const { commentariesByLine } = await import("../lib/line-context");
    const row = (line_id: number, source_code: string) => ({
      line_id, source_code, language: "pa", body_unicode: `${source_code} ${line_id}`, caveat: null,
    });
    const byLine = commentariesByLine([
      row(1, "faridkot"), row(1, "ss_darpan"), row(2, "manmohan_en"), row(1, "manmohan_pa"), row(1, "unknown_src"),
    ]);
    expect(byLine.get(1)!.map((c) => c.source_code)).toEqual(["ss_darpan", "manmohan_pa", "faridkot", "unknown_src"]);
    expect(byLine.get(2)!.map((c) => c.source_code)).toEqual(["manmohan_en"]);
  });
});

describe("CommentaryPicker", () => {
  it("offers Off plus each source present, with Off chosen by default", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const { CommentaryPicker } = await import("../components/line/CommentaryPicker");
    const html = renderToStaticMarkup(createElement(CommentaryPicker, {
      sources: [
        { code: "ss_darpan", name: "Sri Guru Granth Sahib Darpan", author: "Prof. Sahib Singh" },
        { code: "faridkot", name: "Faridkot Teeka", author: "Sant Giani Badan Singh Ji and others (1928)" },
      ],
    }));
    expect(html).toContain('role="radiogroup"');
    expect(html.match(/role="radio"/g)).toHaveLength(3);
    expect(html).toMatch(/aria-checked="true"[^>]*>Off</);
    expect(html).toContain("Faridkot Teeka");
  });
});
