/**
 * Passages from BaniDB's banis (#220): a bani's paragraphs (Japji's pauris,
 * its Mul Mantar and saloks, …) matched to our lines, so the viewer can open
 * a line in its pauri rather than the shabad BaniDB files it under.
 */
import { describe, it, expect } from "vitest";
import { alignBani, pickPassage, normalizeText, narrowerThanShabad, type CorpusLine } from "../lib/passages";

const line = (id: number, text: string, ang = 1, source_fk = 1): CorpusLine =>
  ({ id, verse_id: id, source_fk, ang, gurmukhi: text });

describe("normalizeText", () => {
  it("ignores spacing differences", () => {
    expect(normalizeText(" ਆਦਿ  ਸਚੁ ਜੁਗਾਦਿ ਸਚੁ ॥ ")).toBe("ਆਦਿ ਸਚੁ ਜੁਗਾਦਿ ਸਚੁ ॥");
  });
});

describe("alignBani", () => {
  const corpus = [
    line(1, "ੴ ਸਤਿ ਨਾਮੁ ॥"), line(2, "॥ ਜਪੁ ॥"),
    line(3, "ਆਦਿ ਸਚੁ ॥"), line(4, "ਹੈ ਭੀ ਸਚੁ ॥੧॥"),
    line(5, "ਸੋਚੈ ਸੋਚਿ ॥"), line(6, "ਚੁਪੈ ਚੁਪ ॥"),
    line(7, "ਹੁਕਮੀ ਹੋਵਨਿ ॥", 2), line(8, "ਹੁਕਮੀ ਹੋਵਨਿ ॥", 2), line(9, "ਨਾਨਕ ਹੁਕਮੈ ॥੨॥", 2),
  ];
  const onPage = (page: number) => corpus.filter((l) => l.ang === page);
  const v = (paragraph: number, page: number, text: string) => ({ paragraph, page, text });

  it("groups each paragraph's lines into one passage, in order", () => {
    const { runs, unmatched } = alignBani([
      v(1, 1, "ੴ ਸਤਿ ਨਾਮੁ ॥"), v(2, 1, "॥ ਜਪੁ ॥"),
      v(3, 1, "ਆਦਿ ਸਚੁ ॥"), v(3, 1, "ਹੈ ਭੀ ਸਚੁ ॥੧॥"),
      v(4, 1, "ਸੋਚੈ ਸੋਚਿ ॥"), v(4, 1, "ਚੁਪੈ ਚੁਪ ॥"),
    ], onPage);
    expect(unmatched).toEqual([]);
    expect(runs.map((r) => [r.ordinal, r.first.id, r.last.id])).toEqual([[1, 1, 1], [2, 2, 2], [3, 3, 4], [4, 5, 6]]);
  });

  it("matches a repeated line to the next one in reading order, not the first", () => {
    const { runs } = alignBani([v(1, 2, "ਹੁਕਮੀ ਹੋਵਨਿ ॥"), v(1, 2, "ਹੁਕਮੀ ਹੋਵਨਿ ॥"), v(1, 2, "ਨਾਨਕ ਹੁਕਮੈ ॥੨॥")], onPage);
    expect(runs.map((r) => [r.first.id, r.last.id])).toEqual([[7, 9]]);
  });

  it("numbers paragraphs 1, 2, … whatever BaniDB's own numbers are", () => {
    const { runs } = alignBani([v(10, 1, "ਆਦਿ ਸਚੁ ॥"), v(10, 1, "ਹੈ ਭੀ ਸਚੁ ॥੧॥"), v(12, 1, "ਸੋਚੈ ਸੋਚਿ ॥")], onPage);
    expect(runs.map((r) => r.ordinal)).toEqual([1, 2]);
  });

  it("splits a paragraph where the bani skips lines, so each passage is a contiguous range", () => {
    const { runs } = alignBani([v(1, 1, "ਆਦਿ ਸਚੁ ॥"), v(1, 1, "ਸੋਚੈ ਸੋਚਿ ॥")], onPage);
    expect(runs.map((r) => [r.ordinal, r.part, r.first.id, r.last.id])).toEqual([[1, 1, 3, 3], [1, 2, 5, 5]]);
  });

  it("reports verses it can't find rather than guessing", () => {
    const { runs, unmatched } = alignBani([v(1, 1, "ਆਦਿ ਸਚੁ ॥"), v(1, 1, "ਵਾਹਿਗੁਰੂ")], onPage);
    expect(runs).toHaveLength(1);
    expect(unmatched).toEqual([v(1, 1, "ਵਾਹਿਗੁਰੂ")]);
  });

  it("follows a bani across scriptures, one passage per scripture", () => {
    const mixed = [line(1, "ਸੋ ਦਰੁ ॥", 8, 1), line(50, "ਹਮਰੀ ਕਰੋ ਹਾਥ ਦੈ ਰਛਾ ॥", 8, 3)];
    const { runs } = alignBani([v(1, 8, "ਸੋ ਦਰੁ ॥"), v(1, 8, "ਹਮਰੀ ਕਰੋ ਹਾਥ ਦੈ ਰਛਾ ॥")], (p) => mixed.filter((l) => l.ang === p));
    expect(runs.map((r) => [r.source_fk, r.first.id])).toEqual([[1, 1], [3, 50]]);
  });
});

describe("pickPassage", () => {
  const p = (first: number, last: number, bani_id = 2) => ({ first_verse_id: first, last_verse_id: last, bani_id });

  it("takes the smallest passage holding the line", () => {
    expect(pickPassage([p(1, 40), p(5, 10), p(5, 12)])).toEqual(p(5, 10));
  });

  it("breaks a tie by the lower bani id, so a line in both Japji and Rehras opens the same way each time", () => {
    expect(pickPassage([p(5, 10, 21), p(5, 10, 2)])).toEqual(p(5, 10, 2));
  });

  it("is null when no passage holds the line", () => {
    expect(pickPassage([])).toBeNull();
  });
});

describe("narrowerThanShabad", () => {
  const shabad = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((verse_id) => ({ verse_id }));
  const p = (first: number, last: number) => ({ first_verse_id: first, last_verse_id: last });

  it("opens a pauri inside a bigger shabad as the pauri (Japji's first shabad)", () => {
    expect(narrowerThanShabad(p(5, 10), shabad)).toBe(true);
    expect(narrowerThanShabad(p(1, 1), shabad)).toBe(true);
  });

  it("keeps the shabad when the passage is the whole shabad", () => {
    expect(narrowerThanShabad(p(1, 10), shabad)).toBe(false);
  });

  it("keeps the shabad when the passage runs past it", () => {
    expect(narrowerThanShabad(p(5, 14), shabad)).toBe(false);
  });

  it("takes the passage for a line with no shabad", () => {
    expect(narrowerThanShabad(p(5, 14), [])).toBe(true);
  });
});
