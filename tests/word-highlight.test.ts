/**
 * The word page's occurrence lines mark the word. indexOf found the first
 * match anywhere, so ਮਨ was marked inside ਮਨਿ and ਿ was left on a dotted
 * circle (#347). Only a whole word is marked now.
 * Run: npm test
 */
import { describe, expect, it } from "vitest";
import { wordSpan } from "../lib/word-highlight";

describe("wordSpan", () => {
  it("finds the word where it stands alone, skipping it inside a longer word", () => {
    const text = "ਮਨਿ ਜੀਤੈ ਜਗੁ ਜੀਤੁ ਮਨ ॥";
    expect(wordSpan(text, "ਮਨ")).toEqual({ start: text.lastIndexOf("ਮਨ"), end: text.lastIndexOf("ਮਨ") + 2 });
  });

  it("finds a word at the start, before a danda, or between spaces", () => {
    expect(wordSpan("ਨਾਮੁ ਜਪਿ", "ਨਾਮੁ")).toEqual({ start: 0, end: 4 });
    expect(wordSpan("ਜਪਿ ਨਾਮੁ॥", "ਨਾਮੁ")).toEqual({ start: 4, end: 8 });
    expect(wordSpan("ਜਪਿ ਨਾਮੁ ਜਪਿ", "ਨਾਮੁ")).toEqual({ start: 4, end: 8 });
  });

  it("marks nothing when the word only occurs inside other words", () => {
    expect(wordSpan("ਮਨਿ ਮਨੁ", "ਮਨ")).toBeNull();
  });
});
