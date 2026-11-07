/**
 * Unit tests for how a definition row is presented on the word page.
 * Run: npm test
 */

import { describe, it, expect } from "vitest";
import { entryLink, secondaryGloss, splitPointerRows } from "../lib/definition-display";

describe("secondaryGloss", () => {
  // #122: Shackle stores its English in definition_text AND definition_en
  // (all 6,936 rows identical), so showing both printed the gloss twice.
  it("is null when the English gloss repeats the definition text", () => {
    const text = "ego, pride, the false I, self-centredness";
    expect(secondaryGloss({ definition_text: text, definition_en: text })).toBeNull();
  });

  it("ignores surrounding whitespace when comparing", () => {
    expect(
      secondaryGloss({ definition_text: "the True Guru ", definition_en: " the True Guru" })
    ).toBeNull();
  });

  it("is null when there is no English gloss", () => {
    expect(secondaryGloss({ definition_text: "ਸੰਗ੍ਯਾ- ਅਹੰ", definition_en: null })).toBeNull();
  });

  it("returns a gloss that adds something, e.g. English under Mahan Kosh Punjabi", () => {
    expect(
      secondaryGloss({ definition_text: "ਸੰਗ੍ਯਾ- ਅਹੰ- ਮਮ.", definition_en: "noun: ego, the sense of I" })
    ).toBe("noun: ego, the sense of I");
  });
});

describe("entryLink", () => {
  it("links a Mahan Kosh entry to its SearchGurbani page", () => {
    expect(entryLink("mahan_kosh", "ਹਉਮੈ")).toBe(
      `https://www.searchgurbani.com/sggs-kosh/view?Word=${encodeURIComponent("ਹਉਮੈ")}`
    );
  });

  // Shackle's glossary has no per-entry page online; its dict_sources.url
  // pointed at a publisher page that no longer resolves.
  it("gives no link for a source without a per-entry page", () => {
    expect(entryLink("shackle", "ਹਉਮੈ")).toBeNull();
    expect(entryLink("manual", "ਹਉਮੈ")).toBeNull();
  });
});

// Mahan Kosh rows that only send the reader elsewhere ("ਦੇਖੋ, ਮੰਞੁ.") are not senses (#23).
describe("splitPointerRows", () => {
  const row = (id: number, definition_text: string) => ({ id, definition_text });

  it("moves Mahan Kosh pointer-only rows out of the senses, keeping their targets once each", () => {
    const { senses, pointers } = splitPointerRows("mahan_kosh", [
      row(1, "ਮੈਂ. ਅਹੰ."),
      row(2, "ਦੇਖੋ, ਮੰਞੁ."),
      row(3, 'ਦੇਖੋ, ਕਰਣ ੧੧. "ਕਰਣ ਕਰੀਮ." (ਵਾਰ ਮਾਝ ਮਃ ੧)'),
      row(4, "ਦੇਖੋ, ਮੰਞੁ"),
    ]);
    expect(senses.map((d) => d.id)).toEqual([1]);
    expect(pointers).toEqual([
      { target: "ਮੰਞੁ", sense: null },
      { target: "ਕਰਣ", sense: 11 },
    ]);
  });

  it("keeps a row with Mahan Kosh's own words after the pointer as a sense", () => {
    const text = 'ਦੇਖੋ, ਦੁਲਹ. "ਦੂਲਹ ਪ੍ਰਭੁ." (ਮਾਰੂ ਨਾਮਦੇਵ) ਦੂਲਹ ਤੋਂ ਭਾਵ ਜੀਵ ਹੈ.';
    expect(splitPointerRows("mahan_kosh", [row(1, text)])).toEqual({ senses: [row(1, text)], pointers: [] });
  });

  it("leaves other sources alone", () => {
    expect(splitPointerRows("shackle", [row(1, "ਦੇਖੋ, ਮੰਞੁ.")])).toEqual({ senses: [row(1, "ਦੇਖੋ, ਮੰਞੁ.")], pointers: [] });
  });
});
