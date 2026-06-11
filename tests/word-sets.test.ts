/**
 * Unit tests for word-set pure helpers (no DB/network).
 * Run: npm test
 */

import { describe, it, expect } from "vitest";
import { extractVerseIds, aggregateWordCounts, chunk } from "../pipeline/word-sets/aggregate";
import { WORD_SETS } from "../pipeline/word-sets/sets";
import type { BaniDBBani } from "../lib/banidb";

describe("extractVerseIds", () => {
  it("pulls verseId from each nested verse", () => {
    const bani = {
      baniInfo: {},
      verses: [
        { verse: { verseId: 12, pageNo: 1, lineNo: 1 } },
        { verse: { verseId: 13, pageNo: 1, lineNo: 2 } },
      ],
    } as BaniDBBani;
    expect(extractVerseIds(bani)).toEqual([12, 13]);
  });

  it("skips entries with no numeric verseId and tolerates empty input", () => {
    const bani = {
      baniInfo: {},
      verses: [
        { verse: { verseId: 5, pageNo: 1, lineNo: 1 } },
        { verse: {} },
      ],
    } as unknown as BaniDBBani;
    expect(extractVerseIds(bani)).toEqual([5]);
    expect(extractVerseIds({ baniInfo: {}, verses: [] })).toEqual([]);
  });
});

describe("aggregateWordCounts", () => {
  it("counts occurrences per word_id", () => {
    const counts = aggregateWordCounts([
      { word_id: 1 },
      { word_id: 1 },
      { word_id: 2 },
    ]);
    expect(counts.get(1)).toBe(2);
    expect(counts.get(2)).toBe(1);
    expect(counts.size).toBe(2);
  });

  it("returns an empty map for no rows", () => {
    expect(aggregateWordCounts([]).size).toBe(0);
  });
});

describe("chunk", () => {
  it("splits into bounded batches, keeping the remainder", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns empty for empty input and rejects non-positive size", () => {
    expect(chunk([], 3)).toEqual([]);
    expect(() => chunk([1], 0)).toThrow();
  });
});

describe("WORD_SETS registry", () => {
  it("defines the japji pilot set as BaniDB bani 2", () => {
    expect(WORD_SETS.japji.definition).toEqual({ type: "banidb_bani", baniId: 2 });
  });
});
