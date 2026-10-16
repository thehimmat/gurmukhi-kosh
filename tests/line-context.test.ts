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
    expect(parts).toEqual([{ text: "ਮਹਤੁ", word: "ਮਹਤੁ", i: 0 }, { text: "॥" }]);
  });

  it("leaves ੴ and verse numbers unlinked", () => {
    expect(lineParts("ੴ ॥੨॥").filter((p) => p.word)).toEqual([{ text: "ੴ", word: "ੴ", i: 0 }]);
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
    // Resources come with the shabad: BaniDB English from the line, the rest
    // from line_translations, in view order.
    const codes = ctx!.resources.get(32)!.map((r) => r.source_code);
    expect(codes).toContain("banidb_en");
    expect(codes).toContain("ss_darpan");
    expect(codes.indexOf("manmohan_en")).toBeLessThan(codes.indexOf("ss_darpan"));
    expect(ctx!.scope).toBe("passage");
    // Japji's paragraph here is the whole shabad, so the shabad stands.
    expect(ctx!.passage).toBeNull();
  });

  it("opens a line in Japji's first shabad in its own passage (#220)", async () => {
    const { fetchLineContext } = await import("../lib/line-context");
    // Shabad 1 holds the Mul Mantar, ॥ਜਪੁ॥, the salok and Pauri 1 (verses 5-10).
    const ctx = await fetchLineContext(7);
    expect(ctx!.lines.map((l) => l.id)).toEqual([5, 6, 7, 8, 9, 10]);
    expect(ctx!.passage).toMatchObject({ bani_id: 2, ordinal: 4 });
    expect(ctx!.prevId).toBe(4);
    expect(ctx!.nextId).toBe(11);
  });

  it("reads the whole ang in the ang scope", async () => {
    const { fetchLineContext } = await import("../lib/line-context");
    const ctx = await fetchLineContext(32, "ang");
    expect(ctx!.scope).toBe("ang");
    expect(new Set(ctx!.lines.map((l) => l.ang))).toEqual(new Set([2]));
    // Ang 2 holds more than one shabad (it ends Pauri 3 and opens Pauri 4).
    expect(new Set(ctx!.lines.map((l) => l.shabad_id)).size).toBeGreaterThan(1);
  });

  it("returns null for a line that doesn't exist", async () => {
    const { fetchLineContext } = await import("../lib/line-context");
    expect(await fetchLineContext(999999999)).toBeNull();
  });
});

describe("resourcesByLine", () => {
  it("groups each line's resources in view order: translations, then commentaries", async () => {
    const { resourcesByLine } = await import("../lib/line-context");
    const row = (line_id: number, source_code: string) => ({
      line_id, source_code, language: "pa", body_unicode: `${source_code} ${line_id}`, caveat: null,
    });
    const byLine = resourcesByLine([
      row(1, "faridkot"), row(1, "ss_darpan"), row(2, "manmohan_en"), row(1, "banidb_en"), row(1, "unknown_src"),
    ]);
    expect(byLine.get(1)!.map((c) => c.source_code)).toEqual(["banidb_en", "ss_darpan", "faridkot", "unknown_src"]);
    expect(byLine.get(2)!.map((c) => c.source_code)).toEqual(["manmohan_en"]);
  });
});

describe("defaultSources", () => {
  it("shows every source a view has", async () => {
    const { defaultSources } = await import("../lib/line-context");
    const present = new Set(["banidb_en", "manmohan_en", "ss_darpan", "faridkot", "manmohan_pa"]);
    expect(defaultSources("translation", present)).toEqual(["banidb_en", "manmohan_en"]);
    expect(defaultSources("commentary", present)).toEqual(["ss_darpan", "faridkot", "manmohan_pa"]);
  });

  it("starts BaniDB English off once Dr Sant Singh Khalsa's own translation is there", async () => {
    const { defaultSources } = await import("../lib/line-context");
    expect(defaultSources("translation", new Set(["ssk_en", "banidb_en", "manmohan_en"]))).toEqual(["ssk_en", "manmohan_en"]);
  });
});

describe("ResourcePicker", () => {
  const sources = [
    { code: "banidb_en", name: "BaniDB English", author: "BaniDB (Khalis Foundation), revised from Dr Sant Singh Khalsa" },
    { code: "manmohan_en", name: "English translation", author: "Bhai Manmohan Singh (SGPC)" },
    { code: "ss_darpan", name: "Sri Guru Granth Sahib Darpan", author: "Prof. Sahib Singh" },
  ];

  it("offers a tab per view the passage has, and the current view's sources", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const { ResourcePicker } = await import("../components/line/ResourcePicker");
    const html = renderToStaticMarkup(createElement(ResourcePicker, {
      sources,
      initial: { view: "translation", on: { translation: ["banidb_en"], commentary: ["ss_darpan"] } },
    }));
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(html).toMatch(/aria-selected="true"[^>]*>Translation</);
    expect(html).toMatch(/aria-pressed="true"[^>]*>BaniDB English/);
    expect(html).toMatch(/aria-pressed="false"[^>]*>English translation · Bhai Manmohan Singh/);
    expect(html).not.toContain("Darpan ·");
  });

  it("marks the grid with the view and each shown source", async () => {
    const { gridAttributes } = await import("../lib/line-context");
    expect(gridAttributes({ view: "commentary", on: { translation: ["banidb_en"], commentary: ["ss_darpan", "faridkot"] } }))
      .toEqual({ "data-view": "commentary", "data-on-ss_darpan": "1", "data-on-faridkot": "1" });
  });
});

// A server component can render a client component but not call its
// functions: LineView calling gridAttributes() from the "use client" picker
// 500'd every /line page in production. Client modules export components only.
describe("viewer client boundary", () => {
  it("'use client' modules under components/line export only components", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const dir = "components/line";
    for (const f of readdirSync(dir)) {
      const src = readFileSync(`${dir}/${f}`, "utf8");
      if (!/^["']use client["']/.test(src.trimStart())) continue;
      const exported = [...src.matchAll(/export\s+(?:async\s+)?(?:function|const|let)\s+(\w+)/g)].map((m) => m[1]);
      for (const name of exported) expect(name, `${f} exports ${name}`).toMatch(/^[A-Z]/);
    }
  });
});
