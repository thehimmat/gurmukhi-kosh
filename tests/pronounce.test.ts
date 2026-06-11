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
});
