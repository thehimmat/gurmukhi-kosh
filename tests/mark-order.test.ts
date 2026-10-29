/**
 * BaniDB stores some nasal marks before the aunkar or dulainkar (ਨੰੂ for ਨੂੰ) — the legacy-font
 * conversion's order, not Unicode's (#310). They render alike, but the stored words differ, so counts
 * and search split them. pipeline/sggs/mark-order.ts puts the marks in Unicode order at ingest.
 */
import { describe, it, expect } from "vitest";
import { fixMarkOrder } from "../pipeline/sggs/mark-order";

describe("fixMarkOrder", () => {
  it("puts the vowel sign before the tippi or bindi, and fixes the transliteration to match", () => {
    expect(fixMarkOrder("ਦੇਖਣ ਚੰਡ ਪ੍ਰਚੰਡ ਨੰੂ ਰਣ ਘੁਰੇ ਨਗਾਰੇ ॥", "dhekhan cha(n)dd pracha(n)dd na(n)oo ran ghure nagaare ||"))
      .toEqual({ gurmukhi: "ਦੇਖਣ ਚੰਡ ਪ੍ਰਚੰਡ ਨੂੰ ਰਣ ਘੁਰੇ ਨਗਾਰੇ ॥", transliteration: "dhekhan cha(n)dd pracha(n)dd noo(n) ran ghure nagaare ||", changed: true });
    expect(fixMarkOrder("ਕੋਟ ਕਰੀ ਤਪਸਾ ਦਿਨ ਕੋਟਿਕ ਕਾਹੰੂ ਨ ਕੌਡੀ ਕੋ ਕਾਮ ਕਢਾਯੋ ॥", "kot karee tapasaa dhin koTik kaaha(n)oo na kauddee ko kaam kadtaayo ||").transliteration)
      .toBe("kot karee tapasaa dhin koTik kaahoo(n) na kauddee ko kaam kadtaayo ||");
  });

  it("handles the aunkar too, mid-word and final", () => {
    expect(fixMarkOrder("ਸਮੰੁਦ੍ਰ", "sama(n)udhr")).toMatchObject({ gurmukhi: "ਸਮੁੰਦ੍ਰ", transliteration: "samu(n)dhr" });
    expect(fixMarkOrder("ਗਲਹੰੁ", "galaha(n)")).toMatchObject({ gurmukhi: "ਗਲਹੁੰ", transliteration: "galahu(n)" });
  });

  it("joins ੳ and its vowel sign into the vowel letter", () => {
    expect(fixMarkOrder("ਨਾੳਂੁ", "naau(n)")).toMatchObject({ gurmukhi: "ਨਾਉਂ", transliteration: "naau(n)" });
  });

  it("leaves a correct line, and a missing transliteration, alone", () => {
    expect(fixMarkOrder("ਨੂੰ ਹੁੰ ਕਿਉਂ", "noo(n) hu(n) kiau(n)")).toEqual({ gurmukhi: "ਨੂੰ ਹੁੰ ਕਿਉਂ", transliteration: "noo(n) hu(n) kiau(n)", changed: false });
    expect(fixMarkOrder("ਨੰੂ", null)).toEqual({ gurmukhi: "ਨੂੰ", transliteration: null, changed: true });
  });

  it("keeps a transliteration it cannot line up with the words", () => {
    expect(fixMarkOrder("ਨੰੂ ਕਹਿ", "na(n)oo")).toEqual({ gurmukhi: "ਨੂੰ ਕਹਿ", transliteration: "na(n)oo", changed: true });
  });
});
