import { describe, it, expect } from "vitest";
import { parsePage, parseUnit, type ScanPage } from "../pipeline/scans/text-layer/read";
import { matchUnitLines } from "../pipeline/scans/text-layer/match";
import { buildRows } from "../pipeline/scans/text-layer/rows";

// Shapes as scan-text-layer writes them: out/<slug>/pages/NNNN.json and translations/<slug>.jsonl.
// Synthetic text: the real transcriptions are curator-only and this repo is public.
const page = (n: number, lines: [string, string][]): ScanPage =>
  parsePage({ page: n, lines: lines.map(([type, text], i) => ({ n: i + 1, type, text })) });

const p1 = page(1, [
  ["pagenum", "(੧)"],
  ["heading", "ਮੰਗਲ"],
  ["body", "ਪਹਿਲੀ ਤੁਕ ਕਾ ਅਰਥ ਹੈ।"],
  ["body", "ਪ੍ਰਸ਼ਨ।"],
  ["body", "ਦੂਜੀ ਤੁਕ ਕਾ ਅਰਥ ਸ਼ੁਰੂ"],
]);
const p2 = page(2, [
  ["running-head", "ਟੀਕਾ"],
  ["body", "ਹੋਤ ਹੈ ਔਰ ਖ਼ਤਮ ਹੋਤ ਹੈ।"],
  ["body", "ਪ੍ਰਸ਼ਨ।"],
  ["body", "ਤੀਜੀ ਤੁਕ।"],
]);
const pages = new Map([[1, p1], [2, p2]]);

const rawUnit = {
  unit: "pauri 1",
  pages: [1, 2],
  source: "ਮੰਗਲ\nਪਹਿਲੀ ਤੁਕ ਕਾ ਅਰਥ ਹੈ।\nਪ੍ਰਸ਼ਨ।\nਦੂਜੀ ਤੁਕ ਕਾ ਅਰਥ ਸ਼ੁਰੂ\nਹੋਤ ਹੈ",
  gurbani: [{ text: "ਗੁਰਮੁਖਿ", canon_id: "1", ssk: "the Gurmukh", fresh: "the Guru-facing one" }],
  translation: "Mangal. The first line means…",
  literal: "",
  context: "what he is doing",
  nuances: ["a nuance"],
  doubts: [{ span: "ਹੋਤ", options: ["a", "b"], confidence: "low", why: "x" }],
  terms: [{ gurmukhi: "ਟੀਕਾ", iso: "ṭīkā", rendering: "commentary" }],
};

describe("parsePage", () => {
  it("keeps the line numbers, types and text", () => {
    expect(p1.lines[2]).toEqual({ n: 3, type: "body", text: "ਪਹਿਲੀ ਤੁਕ ਕਾ ਅਰਥ ਹੈ।" });
  });

  it("refuses a line type the schema does not know, naming it", () => {
    expect(() => parsePage({ page: 3, lines: [{ n: 1, type: "colophon", text: "x" }] })).toThrow(/colophon/);
  });
});

describe("parseUnit", () => {
  it("maps the file's fields to the row's, keeping the order number", () => {
    const u = parseUnit(rawUnit, 7);
    expect(u).toMatchObject({ seq: 7, label: "pauri 1", pages: [1, 2], literal: null });
    expect(u.doubts).toHaveLength(1);
  });

  it("reads list fields written as a Python-style string as empty, not as text", () => {
    expect(parseUnit({ ...rawUnit, nuances: "['x']" }, 1).nuances).toEqual([]);
  });
});

describe("matchUnitLines", () => {
  const unit = parseUnit(rawUnit, 1);

  it("links each source line to the page line it was taken from, in reading order", () => {
    expect(matchUnitLines(unit, pages)).toEqual([
      { page: 1, n: 2 },
      { page: 1, n: 3 },
      { page: 1, n: 4 },
      { page: 1, n: 5 },
      { page: 2, n: 2 }, // a part of a line ("ਹੋਤ ਹੈ" of "ਹੋਤ ਹੈ ਔਰ…") links to the whole line
    ]);
  });

  it("does not take a repeated line from further on when it has already passed it", () => {
    // ਪ੍ਰਸ਼ਨ। occurs on both pages; the unit's one is p.1 l.4, not p.2 l.3.
    const links = matchUnitLines(unit, pages);
    expect(links).not.toContainEqual({ page: 2, n: 3 });
  });

  it("ignores spacing differences and skips a line it cannot find", () => {
    const u = parseUnit({ ...rawUnit, source: "ਤੀਜੀ  ਤੁਕ।\nਕਿਤੇ ਨਹੀਂ ਇਹ ਤੁਕ" }, 2);
    expect(matchUnitLines(u, pages)).toEqual([{ page: 2, n: 4 }]);
  });

  it("does not link a one-letter fragment to a line that merely contains it", () => {
    const u = parseUnit({ ...rawUnit, source: "ਹ" }, 3);
    expect(matchUnitLines(u, pages)).toEqual([]);
  });
});

describe("buildRows", () => {
  it("builds the rows for every table, numbering units in file order", () => {
    const rows = buildRows({
      slug: "test-teeka",
      title: "Test teeka",
      pages: [p1, p2],
      units: [rawUnit, { ...rawUnit, unit: "pauri 2", pages: [2], source: "ਤੀਜੀ ਤੁਕ।" }],
    });
    expect(rows.text).toEqual({ slug: "test-teeka", title: "Test teeka", source_note: null });
    expect(rows.pages).toEqual([
      { text_slug: "test-teeka", page: 1, image_path: "test-teeka/0001.webp", width: null, height: null },
      { text_slug: "test-teeka", page: 2, image_path: "test-teeka/0002.webp", width: null, height: null },
    ]);
    expect(rows.lines).toHaveLength(9);
    expect(rows.lines[0]).toEqual({ text_slug: "test-teeka", page: 1, n: 1, type: "pagenum", text: "(੧)", bbox: null });
    expect(rows.units.map((u) => [u.seq, u.label])).toEqual([[1, "pauri 1"], [2, "pauri 2"]]);
    expect(rows.unitLines.filter((l) => l.seq === 2)).toEqual([{ text_slug: "test-teeka", seq: 2, page: 2, n: 4 }]);
  });

  it("refuses a unit naming a page that has no transcription", () => {
    expect(() =>
      buildRows({ slug: "t", title: "t", pages: [p1], units: [{ ...rawUnit, pages: [1, 5] }] }),
    ).toThrow(/page 5/);
  });
});
