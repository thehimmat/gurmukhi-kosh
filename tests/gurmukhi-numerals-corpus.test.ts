import { describe, it, expect } from "vitest";
import { extractNumerals, type NumeralRole } from "../lib/gurmukhi-numerals";

// Real lines taken verbatim from the corpus (all three ingested sources),
// chosen to cover every heading shape the keyword audit turned up. The
// hand-written cases in gurmukhi-numerals.test.ts state the rules; this file
// pins them against text that actually exists, so a keyword or lookback tweak
// cannot quietly change how the corpus classifies.
const CORPUS: Array<[line: string, roles: NumeralRole[]]> = [
  // --- author only ---
  ["ਆਸਾ ਮਹਲਾ ੫ ॥", ["author"]],
  ["ਸਲੋਕ ਮਃ ੩ ॥", ["author"]],
  ["ਸਲੋਕ ਡਖਣਾ ਮਃ ੫ ॥", ["author"]],
  ["ਸਲੋਕ ਸਹਸਕ੍ਰਿਤੀ ਮਹਲਾ ੧ ॥", ["author"]],
  ["ਉਤਾਰ ਖਾਸੇ ਦਸਖਤ ਕਾ ॥ ਪਾਤਿਸਾਹੀ ੧੦ ॥", ["author"]],
  ["ਸਵਈਏ ਮਹਲੇ ਚਉਥੇ ਕੇ ੪", ["author"]],
  ["ਸਵਈਏ ਮਹਲੇ ਪਹਿਲੇ ਕੇ ੧", ["author"]],

  // --- author + ghar, in both orders ---
  ["ਆਸਾ ਮਹਲਾ ੪ ਘਰੁ ੨", ["author", "ghar"]],
  ["ਆਸਾ ਛੰਤ ਮਹਲਾ ੫ ਘਰੁ ੪", ["author", "ghar"]],
  ["ਆਸਾ ਮਹਲਾ ੧ ਛੰਤ ਘਰੁ ੩ ॥", ["author", "ghar"]],
  ["ਆਸਾ ਮਹਲਾ ੩ ਅਸਟਪਦੀਆ ਘਰੁ ੨", ["author", "ghar"]],
  ["ਆਸਾ ਮਹਲਾ ੫ ਬਿਰਹੜੇ ਘਰੁ ੪ ਛੰਤਾ ਕੀ ਜਤਿ", ["author", "ghar"]],
  ["ਆਸਾ ਕਾਫੀ ਮਹਲਾ ੧ ਘਰੁ ੮ ਅਸਟਪਦੀਆ ॥", ["author", "ghar"]],
  // Reversed: the ghar comes first. Nearest keyword wins either way.
  ["ਆਸਾ ਘਰੁ ੧੦ ਮਹਲਾ ੫ ॥", ["ghar", "author"]],
  ["ਆਸਾ ਘਰੁ ੮ ਕਾਫੀ ਮਹਲਾ ੩", ["ghar", "author"]],
  ["ਸਿਰੀਰਾਗੁ ਮਹਲਾ ੧ ਘਰੁ ਦੂਜਾ ੨ ॥", ["author", "ghar"]],

  // --- a keyword's number, then a counted form ---
  ["ਆਸਾ ਮਹਲਾ ੫ ਦੁਤੁਕੇ ੯ ॥", ["author", "heading_other"]],
  ["ਆਸਾ ਮਹਲਾ ੫ ਇਕਤੁਕੇ ੨ ॥", ["author", "heading_other"]],
  ["ਆਸਾ ਮਹਲਾ ੫ ਤਿਪਦੇ ੨ ॥", ["author", "heading_other"]],
  ["ਆਸਾ ਮਹਲਾ ੫ ਦੁਪਦਾ ੧ ॥", ["author", "heading_other"]],
  ["ਆਸਾ ਮਹਲਾ ੫ ਘਰੁ ੧੫ ਪੜਤਾਲ", ["author", "ghar"]],

  // --- no keyword at all ---
  ["ਆਸਾ ਇਕਤੁਕੇ ੪ ॥", ["heading_other"]],
  ["ਆਸਾ ਸ੍ਰੀ ਕਬੀਰ ਜੀਉ ਕੇ ਪੰਚਪਦੇ ੯ ਦੁਤੁਕੇ ੫", ["heading_other", "heading_other"]],
  ["ਗਉੜੀ ਪੂਰਬੀ ੧੨ ॥", ["heading_other"]],
  ["ਗਉੜੀ ਮਾਲਾ ੫ ॥", ["heading_other"]],
  ["ਛਕਾ ੧ ॥", ["heading_other"]],
  ["ਸਲੋਕੁ ਮਰਦਾਨਾ ੧ ॥", ["heading_other"]],
  // Bhai Gurdas pauri headings — the bulk of this bucket.
  ["ਪਉੜੀ ੧ (ਮੰਗਲਾਚਰਣ)", ["heading_other"]],
  ["ਪਉੜੀ ੨੭ : ਗੁਰੂ ਨਾਨਕ ਸੂਰਯੋਦਯ", ["heading_other"]],
  ["੧੮ : ਸਿੱਖੀ ਸਰਬ ਸ਼ਿਰੋਮਣੀ ਹੈ", ["heading_other"]],
  ["੧੯ : ਪੰਜਵੀਂ ਪਾਤਸ਼ਾਹੀ ਦੇ ਹੋਰ ਸਿੱਖਾਂ ਦੇ ਨਾਮ", ["heading_other"]],

  // --- verse markers ---
  ["ਜੇਹਾ ਬੀਉ ਤੇਹਾ ਫਲੁ ਪਾਇਆ ॥੧॥", ["verse_marker"]],
  ["ਧਾਣਕ ਰੂਪਿ ਰਹਾ ਕਰਤਾਰ ॥੪॥੨੯॥", ["verse_marker", "verse_marker"]],
  [
    "ਜਨ ਨਾਨਕ ਸਾਹੁ ਹਰਿ ਸੇਵਿਆ ਫਿਰਿ ਲੇਖਾ ਮੂਲਿ ਨ ਲੇਈ ॥੪॥੧॥੭॥੪੫॥",
    ["verse_marker", "verse_marker", "verse_marker", "verse_marker"],
  ],
  ["ਡਰਿ ਡਰਿ ਡਰਣਾ ਮਨ ਕਾ ਸੋਰੁ ॥੧॥ ਰਹਾਉ ॥", ["verse_marker"]],
  ["ਮਚੇ ਬੀਰ ਕ੍ਰੁਧੰ ॥੨੯॥੧੦੬॥", ["verse_marker", "verse_marker"]],

  // --- a tally, then a heading number on the same line ---
  [
    "ਨਾਨਕ ਪਤਿਤ ਪਵਿਤ ਮਿਲਿ ਸੰਗਤਿ ਗੁਰ ਸਤਿਗੁਰ ਪਾਛੈ ਛੁਕਟੀ ॥੨॥੬॥ ਛਕਾ ੧",
    ["verse_marker", "verse_marker", "heading_other"],
  ],
];

describe("extractNumerals against real corpus lines", () => {
  it.each(CORPUS)("%s", (line, expected) => {
    expect(extractNumerals(line).map((n) => n.role)).toEqual(expected);
  });
});

describe("invariants that must hold on any line", () => {
  const lines = CORPUS.map(([line]) => line);

  it("never loses a numeral", () => {
    for (const line of lines) {
      const runs = line.match(/[੦-੯]+/g) ?? [];
      expect(extractNumerals(line).map((n) => n.raw)).toEqual(runs);
    }
  });

  it("reports offsets that slice back to the numeral", () => {
    for (const line of lines) {
      for (const n of extractNumerals(line)) {
        expect(line.slice(n.start, n.end)).toBe(n.raw);
      }
    }
  });

  it("only calls a numeral a verse marker when a danda runs into it", () => {
    for (const line of lines) {
      for (const n of extractNumerals(line)) {
        if (n.role !== "verse_marker") continue;
        expect(line.slice(0, n.start).trimEnd().endsWith("॥")).toBe(true);
      }
    }
  });

  it("only assigns author/ghar when that keyword is present in the line", () => {
    for (const line of lines) {
      for (const n of extractNumerals(line)) {
        if (n.role === "author" || n.role === "ghar") {
          expect(n.keyword).not.toBeNull();
          expect(line).toContain(n.keyword!);
        } else {
          expect(n.keyword).toBeNull();
        }
      }
    }
  });
});
