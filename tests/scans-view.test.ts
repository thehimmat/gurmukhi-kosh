import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveScanImage } from "../lib/scan-images";
import { shapeScanPage, parseShow, DEFAULT_SHOW, type ScanPageRows } from "../lib/scans";

describe("resolveScanImage", () => {
  const root = mkdtempSync(join(tmpdir(), "scans-"));
  mkdirSync(join(root, "garab-ganjani-teeka"));
  writeFileSync(join(root, "garab-ganjani-teeka", "0009.webp"), "x");

  it("finds a page image under the root", () => {
    expect(resolveScanImage(root, ["garab-ganjani-teeka", "0009.webp"])).toBe(join(root, "garab-ganjani-teeka", "0009.webp"));
  });

  it("refuses anything but <slug>/<NNNN>.webp, so nothing outside the root is reachable", () => {
    for (const bad of [["..", "etc", "passwd"], ["garab-ganjani-teeka", "..", "x.webp"], ["garab-ganjani-teeka", "9.webp"], ["Garab", "0009.webp"], ["garab-ganjani-teeka", "0009.png"], ["a", "b", "0009.webp"]]) {
      expect(resolveScanImage(root, bad), bad.join("/")).toBeNull();
    }
  });

  it("returns null for a missing file or no root", () => {
    expect(resolveScanImage(root, ["garab-ganjani-teeka", "0010.webp"])).toBeNull();
    expect(resolveScanImage(undefined, ["garab-ganjani-teeka", "0009.webp"])).toBeNull();
  });
});

describe("parseShow", () => {
  it("defaults to all three panes", () => {
    expect(parseShow(undefined)).toEqual(DEFAULT_SHOW);
    expect(DEFAULT_SHOW).toEqual({ image: true, text: true, translation: true });
  });
  it("reads a comma list, ignoring unknown names", () => {
    expect(parseShow("text,translation,bogus")).toEqual({ image: false, text: true, translation: true });
  });
  it("never hides every pane", () => {
    expect(parseShow("")).toEqual(DEFAULT_SHOW);
    expect(parseShow("bogus")).toEqual(DEFAULT_SHOW);
  });
});

describe("shapeScanPage", () => {
  const rows: ScanPageRows = {
    text: { slug: "t", title: "T" },
    page: { page: 12, image_path: "t/0012.webp", width: 1000, height: 1500 },
    pageNumbers: [9, 10, 11, 12, 13],
    lines: [
      { n: 1, type: "pagenum", text: "(੧੦)", bbox: null },
      { n: 2, type: "body", text: "ਅਰਥ", bbox: [0.1, 0.2, 0.8, 0.03] },
    ],
    units: [
      { seq: 5, label: "b", pages: [12], source: "ਅਰਥ", translation: "Meaning", literal: null, context: null, nuances: [], doubts: [], terms: [], gurbani: [] },
      { seq: 4, label: "a", pages: [11, 12], source: "…", translation: "Earlier", literal: null, context: null, nuances: [], doubts: [], terms: [], gurbani: [] },
    ],
    unitLines: [
      { seq: 5, page: 12, n: 2 },
      { seq: 4, page: 11, n: 7 },
      { seq: 4, page: 12, n: 1 },
    ],
  };
  const view = shapeScanPage(rows);

  it("orders units by sequence and marks ones that began on an earlier page", () => {
    expect(view.units.map((u) => [u.seq, u.continued])).toEqual([[4, true], [5, false]]);
  });

  it("gives each unit the lines it covers on this page only, and each line its units", () => {
    expect(view.units.find((u) => u.seq === 4)!.lines).toEqual([1]);
    expect(view.lines.find((l) => l.n === 2)!.units).toEqual([5]);
  });

  it("links to the previous and next transcribed pages", () => {
    expect([view.prev, view.next]).toEqual([11, 13]);
  });

  it("has no previous page at the first one", () => {
    expect(shapeScanPage({ ...rows, page: { ...rows.page, page: 9 } }).prev).toBeNull();
  });
});
