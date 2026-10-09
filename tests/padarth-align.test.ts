import { describe, it, expect } from "vitest";
import { alignTerms } from "../lib/padarth/align";
import { tokenize } from "../lib/tokenizer";

// Lines and terms are verbatim from SGGS and its ss_padarth rows (line ids
// noted). Alignment is exact after orthographic normalisation only: a term
// Sahib Singh glosses in a different form (ਪੁਰੀ for ਪੁਰੀਆ, ਕੋਟੁ for ਕੋਟਿ) is
// left unmatched rather than guessed onto a similar-looking word.

describe("alignTerms", () => {
  it("matches single words and contiguous phrases (line 5)", () => {
    const tokens = tokenize("ਸੋਚੈ ਸੋਚਿ ਨ ਹੋਵਈ ਜੇ ਸੋਚੀ ਲਖ ਵਾਰ ॥");
    expect(alignTerms(tokens, ["ਸੋਚੈ", "ਨ ਹੋਵਈ", "ਸੋਚੀ"])).toEqual([
      { positions: [0], match: "exact" },
      { positions: [2, 3], match: "exact" },
      { positions: [5], match: "exact" },
    ]);
  });

  it("gives a repeated term the next occurrence of the word (line 17)", () => {
    const tokens = tokenize("ਗਾਵੈ ਕੋ ਤਾਣੁ ਹੋਵੈ ਕਿਸੈ ਤਾਣੁ ॥");
    const out = alignTerms(tokens, ["ਕੋ", "ਤਾਣੁ", "ਕਿਸੈ", "ਤਾਣੁ"]);
    expect(out.map((m) => m?.positions)).toEqual([[1], [2], [4], [5]]);
  });

  it("reuses the first occurrence once every occurrence is taken (line 22)", () => {
    const tokens = tokenize("ਗਾਵੈ ਕੋ ਜੀਅ ਲੈ ਫਿਰਿ ਦੇਹ ॥");
    const out = alignTerms(tokens, ["ਜੀਅ", "ਦੇਹ", "ਦੇਹ", "ਦੇਹਿ"]);
    expect(out.map((m) => m?.positions ?? null)).toEqual([[2], [5], [5], null]);
  });

  it("handles phrases built from a repeated word (line 26)", () => {
    const tokens = tokenize("ਕਥਿ ਕਥਿ ਕਥੀ ਕੋਟੀ ਕੋਟਿ ਕੋਟਿ ॥");
    const out = alignTerms(tokens, ["ਕਥਿ", "ਕਥਿ ਕਥਿ ਕਥੀ", "ਕੋਟਿ", "ਕੋਟਿ", "ਕੋਟੁ", "ਕੋਟ"]);
    expect(out.map((m) => m?.positions ?? null)).toEqual([[0], [0, 1, 2], [4], [5], null, null]);
  });

  it("leaves a term glossed in another form unmatched (line 7)", () => {
    const tokens = tokenize("ਭੁਖਿਆ ਭੁਖ ਨ ਉਤਰੀ ਜੇ ਬੰਨਾ ਪੁਰੀਆ ਭਾਰ ॥");
    const out = alignTerms(tokens, ["ਪੁਰੀ", "ਪੁਰੀਆ ਭਾਰ", "ਭਾਰ"]);
    expect(out).toEqual([
      null,
      { positions: [6, 7], match: "exact" },
      { positions: [7], match: "exact" },
    ]);
  });

  it("matches a phrase whose words are apart in the line, in order (lines 9, 41877)", () => {
    expect(alignTerms(tokenize("ਕਿਵ ਸਚਿਆਰਾ ਹੋਈਐ ਕਿਵ ਕੂੜੈ ਤੁਟੈ ਪਾਲਿ ॥"), ["ਕੂੜੈ ਪਾਲਿ"])).toEqual([
      { positions: [4, 6], match: "gapped" },
    ]);
    expect(
      alignTerms(tokenize("ਆਈ ਰੈਨਿ ਭਇਆ ਸੁਪਨੰਤਰੁ ਬਿਖੁ ਸੁਪਨੈ ਭੀ ਦੁਖ ਸਾਰੇ ॥੫॥"), ["ਬਿਖੁ ਸਾਰੇ", "ਸੁਪਨੈ ਭੀ"])
    ).toEqual([
      { positions: [4, 8], match: "gapped" },
      { positions: [5, 6], match: "exact" },
    ]);
    // order matters: the words must appear in the term's order
    expect(alignTerms(tokenize("ਕਿਵ ਸਚਿਆਰਾ ਹੋਈਐ ਕਿਵ ਕੂੜੈ ਤੁਟੈ ਪਾਲਿ ॥"), ["ਪਾਲਿ ਕੂੜੈ"])).toEqual([null]);
  });

  it("treats the two spellings of pairin haha as the same letter (line 21937)", () => {
    // The line writes ਜਿਨੑ (U+0A51); the pad-arth writes ਜਿਨ੍ਹ੍ਹ (virama + ਹ, doubled).
    const tokens = tokenize("ਜਿਨੑ ਮਨਿ ਹੋਰੁ ਮੁਖਿ ਹੋਰੁ ਸਿ ਕਾਂਢੇ ਕਚਿਆ ॥੧॥");
    expect(alignTerms(tokens, ["ਜਿਨ੍ਹ੍ਹ ਮਨਿ", "ਮੁਖਿ"])).toEqual([
      { positions: [0, 1], match: "exact" },
      { positions: [3], match: "exact" },
    ]);
  });

  it("returns an empty list for no terms", () => {
    expect(alignTerms(["ਸਚੁ"], [])).toEqual([]);
  });
});
