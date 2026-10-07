/**
 * Unit tests for display IPA conversion.
 * Run: npm test
 */

import { describe, it, expect } from "vitest";
import { gurmukhiToDisplayIPA } from "../lib/pronounce/gurmukhi-to-ipa";

describe("gurmukhiToDisplayIPA", () => {
  it("maps consonant + inherent vowel + consonant + vowel diacritic", () => {
    // ਸਤਿ = s + ə (inherent) + t̪ + ɪ
    expect(gurmukhiToDisplayIPA("ਸਤਿ")).toBe("sət̪ɪ");
  });

  it("drops the final inherent schwa by default (display)", () => {
    expect(gurmukhiToDisplayIPA("ਕ")).toBe("k");
  });

  it("keeps the final schwa when explicitly requested", () => {
    expect(gurmukhiToDisplayIPA("ਕ", { finalSchwa: true })).toBe("kə");
  });

  it("is non-empty for a typical Japji word", () => {
    expect(gurmukhiToDisplayIPA("ਨਾਮੁ").length).toBeGreaterThan(0);
  });

  // #124: an independent vowel is the whole syllable nucleus; it never takes
  // the inherent schwa a bare consonant does.
  describe("independent vowels take no inherent schwa", () => {
    it.each([
      ["ਅਕਾਲ", "əkaːl"],
      ["ਅਜੂਨੀ", "əd͡ʒuːn̪iː"],
      ["ਆਪੇ", "aːpeː"],
      ["ਇਕ", "ɪk"],
      ["ਇਹ", "ɪɦ"],
      ["ਹਉਮੈ", "ɦəʊmɛː"],
      ["ਚੌਪਈ", "t͡ʃɔːpəiː"],
    ])("%s → %s", (word, ipa) => {
      expect(gurmukhiToDisplayIPA(word)).toBe(ipa);
    });

    it("keeps a word-final ਅ, which is a vowel, not an inherent schwa", () => {
      expect(gurmukhiToDisplayIPA("ਜੀਅ")).toBe("d͡ʒiːə");
      expect(gurmukhiToDisplayIPA("ਪ੍ਰਿਅ")).toBe("pɾɪə");
    });

    it("adds nothing after a final independent vowel even with finalSchwa", () => {
      expect(gurmukhiToDisplayIPA("ਜਾਇ", { finalSchwa: true })).toBe("d͡ʒaːɪ");
    });
  });
});
