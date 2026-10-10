// TS port of the Shackle reverse transliterator (gurmukhi-transliterate
// reverse.py + matcher.candidate_spellings) and the forward romanizer used for
// headword stems (#18).

import { describe, expect, it } from "vitest";
import parity from "./fixtures/shackle-reverse-parity.json";
import {
  candidateSpellings,
  gurmukhiToShackle,
  reverseTransliterate,
} from "../pipeline/shackle/reverse";

describe("reverseTransliterate", () => {
  it.each([
    ["sati", "ਸਤਿ"],
    ["nāmu", "ਨਾਮੁ"],
    ["hovai", "ਹੋਵੈ"],
    ["hoi", "ਹੋਇ"],
    ["jīa", "ਜੀਅ"],
    ["santa", "ਸੰਤ"],
    ["sabbhanāṁ", "ਸਭਨਾੰ"],
    ["hotaü", "ਹੋਤਉ"],
  ])("%s -> %s", (roman, gurmukhi) => {
    expect(reverseTransliterate(roman).gurmukhi).toBe(gurmukhi);
  });

  it("reads ï as a hiatus i, like ü", () => {
    expect(reverseTransliterate("gaïā").gurmukhi).toBe("ਗਇਆ");
  });

  it("matches the Python engine on 311 glossary headwords", () => {
    for (const row of parity as { roman: string; gurmukhi: string; candidates: string[] }[]) {
      const r = reverseTransliterate(row.roman);
      expect([row.roman, r.gurmukhi]).toEqual([row.roman, row.gurmukhi]);
      expect([row.roman, candidateSpellings(r)]).toEqual([row.roman, row.candidates]);
    }
  });
});

describe("candidateSpellings", () => {
  it("offers bindi and unmarked alternatives for nasalization", () => {
    expect(candidateSpellings(reverseTransliterate("sāṁ"))).toEqual(["ਸਾੰ", "ਸਾਂ", "ਸਾ"]);
  });
  it("can keep only lossless alternatives", () => {
    expect(candidateSpellings(reverseTransliterate("sāṁ"), { lossless: true })).toEqual(["ਸਾੰ", "ਸਾਂ"]);
  });
});

describe("gurmukhiToShackle", () => {
  it.each([
    ["ਹੋਇ", "hoi"],
    ["ਰਾਜਾ", "rājā"],
    ["ਜੀਉ", "jīu"],
    ["ਸਭੁ", "sabhu"],
    ["ਕਰਿ", "kari"],
    ["ਸਭ", "sabha"],
    ["ਕਰਉ", "karaü"],
    ["ਸੰਤ", "saṁta"],
    ["ਨ੍ਹਾਵਣੁ", "nhāvaṇu"],
    ["ਸੱਚ", "sacca"],
    ["ਪ੍ਰਭੁ", "prabhu"],
    ["ਅਉਹਠਿ", "aühaṭhi"],
  ])("%s -> %s", (g, roman) => {
    expect(gurmukhiToShackle(g)).toBe(roman);
  });

  it("round-trips through the reverse engine", () => {
    for (const g of ["ਹੋਇ", "ਰਾਜਾ", "ਜੀਉ", "ਸਭੁ", "ਪਾਇ", "ਕਰਉ", "ਪ੍ਰਭੁ", "ਅਉਹਠਿ"]) {
      expect(reverseTransliterate(gurmukhiToShackle(g)).gurmukhi).toBe(g);
    }
  });
});
