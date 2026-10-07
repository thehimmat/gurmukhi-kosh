import { describe, it, expect } from "vitest";
import { parseTsv, findSpan, cropFor, markDiffs, archivePageUrl } from "../pipeline/scans/review";

const TSV = [
  "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext",
  "1\t1\t0\t0\t0\t0\t0\t0\t2000\t3000\t-1\t",
  "5\t1\t1\t1\t1\t1\t100\t200\t120\t50\t91\tਚਰਮ",
  "5\t1\t1\t1\t1\t2\t240\t200\t100\t50\t90\tਸੇਲ",
  "5\t1\t1\t1\t1\t3\t360\t205\t90\t45\t88\tਗਦਾ",
  "5\t1\t1\t1\t1\t4\t470\t200\t140\t50\t87\tਗੁਰਜ",
  "5\t1\t1\t1\t2\t1\t100\t300\t150\t50\t92\tਨਾਦਨ",
  "5\t1\t1\t1\t2\t2\t270\t300\t60\t50\t92\tਕੈ",
  "5\t1\t1\t1\t2\t3\t350\t300\t60\t50\t-1\t ",
].join("\n");

describe("parseTsv", () => {
  it("reads word boxes with their line, skipping empty words", () => {
    const w = parseTsv(TSV);
    expect(w).toHaveLength(6);
    expect(w[2]).toEqual({ text: "ਗਦਾ", left: 360, top: 205, width: 90, height: 45, line: "1.1.1" });
    expect(w[4].line).toBe("1.1.2");
  });
});

describe("findSpan", () => {
  const words = parseTsv(TSV);

  it("finds the words of a half-line on the page, spelling aside", () => {
    expect(findSpan(words, "ਗਦਾ ਗੁਰਜ ਨਾਦਨ")).toMatchObject({ start: 2, end: 4 });
  });

  it("finds a larivaar (unspaced) reading", () => {
    expect(findSpan(words, "ਸੇਲਗਦਾ")).toMatchObject({ start: 1, end: 2 });
  });

  it("returns null when the reading is not on the page", () => {
    expect(findSpan(words, "ਬਿਖ ਜਾਲ ਹਰਨ ਮਦ ਸੂਦਨ")).toBeNull();
  });
});

describe("cropFor", () => {
  const words = parseTsv(TSV);

  it("crops the whole lines the span touches, with a margin, and boxes the span inside the crop", () => {
    const c = cropFor(words, { start: 2, end: 4 }, { width: 2000, height: 3000 }, 20);
    expect(c.crop).toEqual({ x: 80, y: 180, w: 550, h: 190 });
    // span = ਗਦਾ ਗੁਰਜ (line 1) + ਨਾਦਨ (line 2): one box per line, relative to the crop
    expect(c.highlights).toEqual([
      { x: 280, y: 20, w: 250, h: 50 },
      { x: 20, y: 120, w: 150, h: 50 },
    ]);
  });

  it("never crops past the page edge", () => {
    const c = cropFor(words, { start: 0, end: 0 }, { width: 2000, height: 3000 }, 500);
    expect(c.crop.x).toBe(0);
    expect(c.crop.y).toBe(0);
  });
});

describe("markDiffs", () => {
  it("marks the words of each reading that another reading lacks (spelling and word division aside)", () => {
    const m = markDiffs({ bd: "ਪੈ ਪਾਯ ਸ਼ਰਨੀ ਆਇ", ce: "ਢਹ ਪਏ ਸਰਨੀ ਆਇ", ms: "ਢਹਿਪਏਸਰਨੀਆਇ" });
    expect(m.bd.filter((w) => w.differs).map((w) => w.text)).toEqual(["ਪੈ", "ਪਾਯ"]);
    expect(m.ce.filter((w) => w.differs).map((w) => w.text)).toEqual(["ਢਹ", "ਪਏ"]);
  });

  it("splits a larivaar reading into one token", () => {
    expect(markDiffs({ ms: "ਢਹਿਪਏਸਰਨੀਆਇ", bd: "ਢਹ ਪਏ" }).ms).toHaveLength(1);
  });
});

describe("archivePageUrl", () => {
  it("links to the page in the archive.org reader (leaves count from 0)", () => {
    expect(archivePageUrl("sarbloh_granth_bir", 74)).toBe("https://archive.org/details/sarbloh_granth_bir/page/n73/mode/1up");
  });
});
