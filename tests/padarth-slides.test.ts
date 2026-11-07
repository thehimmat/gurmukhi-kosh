import { describe, it, expect } from "vitest";
import { deckBuffer, deckFileName, slidePlan } from "../lib/padarth/slides";
import { scopeTitle, slidesHref } from "../lib/padarth/scope";
import type { PreviewLine } from "../lib/padarth/preview";

// The Google Slides export (#377): the preview as a .pptx, which Google Slides imports.
const line = (extra: Partial<PreviewLine> = {}): PreviewLine => ({
  lineId: 5,
  introduction: null,
  question: null,
  gurmukhi: "ਸੋਚੈ ਸੋਚਿ ਨ ਹੋਵਈ ॥",
  rows: [
    { surface: "ਸੋਚੈ", text: "ਸੁਚਿ ਰੱਖਣ ਨਾਲ", status: "picked", grammar: [], note: null },
    { surface: "ਸੋਚਿ", text: "purity", status: "override", grammar: [], note: "outer purity" },
    { surface: "ਨ", text: "not", status: "draft", grammar: [], note: null },
    { surface: "ਹੋਵਈ", text: "become", status: "picked", grammar: ["3 sg. subj. of ਹੋਇ"], note: null },
  ],
  phrases: [{ surface: "ਨ ਹੋਵਈ", text: "ਨਹੀਂ ਹੋ ਸਕਦੀ", status: "picked", grammar: [], note: null }],
  note: "the strong bull of Dharam",
  ...extra,
});

describe("slidePlan", () => {
  it("opens with a title slide, then one slide per line: verse, a row per word and phrase, the line note", () => {
    const plan = slidePlan([line()], "ਜਪੁ, ਪਉੜੀ 1");
    expect(plan.map((s) => s.kind)).toEqual(["title", "line"]);
    expect(plan[0]).toEqual({ kind: "title", title: "ਜਪੁ, ਪਉੜੀ 1" });
    expect(plan[1]).toMatchObject({
      kind: "line",
      verse: "ਸੋਚੈ ਸੋਚਿ ਨ ਹੋਵਈ ॥",
      rows: [
        { surface: "ਸੋਚੈ", gloss: "ਸੁਚਿ ਰੱਖਣ ਨਾਲ", grammar: null, note: null },
        { surface: "ਸੋਚਿ", gloss: "purity", grammar: null, note: "outer purity" },
        { surface: "ਨ", gloss: null, grammar: null, note: null },
        { surface: "ਹੋਵਈ", gloss: "become", grammar: "3 sg. subj. of ਹੋਇ", note: null },
        { surface: "ਨ ਹੋਵਈ", gloss: "ਨਹੀਂ ਹੋ ਸਕਦੀ", grammar: null, note: null },
      ],
      note: "the strong bull of Dharam",
    });
  });

  it("gives an introduction and a question their own slides, before their line", () => {
    const plan = slidePlan([line({ introduction: "Purity cannot be had by bathing.", question: "How, then?" })], "x");
    expect(plan.map((s) => s.kind)).toEqual(["title", "introduction", "question", "line"]);
    expect(plan[1]).toEqual({ kind: "introduction", text: "Purity cannot be had by bathing." });
    expect(plan[2]).toEqual({ kind: "question", text: "How, then?" });
  });

  it("copies only chosen text, like Copy as text: an unpicked row keeps its word and no gloss", () => {
    const rows = (slidePlan([line()], "x")[1] as { rows: { surface: string; gloss: string | null }[] }).rows;
    expect(rows.find((r) => r.surface === "ਨ")?.gloss).toBeNull();
  });

  it("shrinks the type for a line with many rows, so it fits the slide", () => {
    const many = line({ rows: Array.from({ length: 14 }, (_, i) => ({ surface: `ਸ${i}`, text: "x", status: "picked" as const, grammar: [], note: null })) });
    const size = (l: PreviewLine) => (slidePlan([l], "x")[1] as { fontSize: number }).fontSize;
    expect(size(many)).toBeLessThan(size(line()));
  });
});

describe("deckBuffer", () => {
  it("writes a .pptx with one slide per planned slide", async () => {
    const buf = await deckBuffer([line({ question: "How, then?" })], "ਜਪੁ");
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    // Zip entry names are stored uncompressed.
    const names = buf.toString("latin1");
    expect(names).toContain("ppt/slides/slide3.xml");
    expect(names).not.toContain("ppt/slides/slide4.xml");
  });
});

describe("the export's link, title and file name", () => {
  it("uses the builder's scope parameters", () => {
    expect(slidesHref({ kind: "paragraph", baniId: 2, ordinal: 4 })).toBe("/admin/padarth/slides?bani=2&p=4");
    expect(slidesHref({ kind: "ang", sourceCode: "sggs_banidb_v2", ang: 3 })).toBe("/admin/padarth/slides?ang=3");
  });

  it("names the deck after its scope", () => {
    expect(scopeTitle({ kind: "paragraph", baniId: 2, ordinal: 4 }, "ਜਪੁ")).toBe("ਜਪੁ, paragraph 4");
    expect(scopeTitle({ kind: "shabad", shabadId: 9 })).toBe("Shabad 9");
    expect(deckFileName("bani=2&p=4")).toBe("padarth-bani-2-paragraph-4.pptx");
    expect(deckFileName("ang=3&source=dasam_banidb_v2")).toBe("padarth-ang-3-source-dasam-banidb-v2.pptx");
  });
});
