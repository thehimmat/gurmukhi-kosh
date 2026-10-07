/**
 * Displaying Shackle glossary rows (#131).
 * Run: npm test
 */

import { describe, it, expect } from "vitest";
import { homographMark, seeTargets, splitShackleGloss } from "../lib/shackle-display";

describe("splitShackleGloss", () => {
  // The OCR dropped the opening quote of Shackle's printed 'gloss', leaving a
  // stray closing quote before the phrases and citations that follow it.
  it("splits the gloss from the detail at the stray closing quote", () => {
    expect(splitShackleGloss("lake': see SARU¹")).toEqual({ gloss: "lake", detail: "see SARU¹" });
    expect(splitShackleGloss("God': hari guṇa, mp. 'God's qualities'")).toEqual({
      gloss: "God",
      detail: "hari guṇa, mp. 'God's qualities'",
    });
  });

  it("keeps a parenthetical that follows the gloss in the detail", () => {
    expect(splitShackleGloss("always, ever' (int. sada sadā): sada raṅga Su4")).toEqual({
      gloss: "always, ever",
      detail: "(int. sada sadā): sada raṅga Su4",
    });
  });

  it("does not split on an apostrophe inside the gloss", () => {
    expect(splitShackleGloss("one's own': apaṇā")).toEqual({ gloss: "one's own", detail: "apaṇā" });
  });

  it("leaves a clean gloss alone", () => {
    expect(splitShackleGloss("fearless, without fear")).toEqual({ gloss: "fearless, without fear", detail: null });
  });
});

describe("seeTargets", () => {
  it("reads the resolved cross-reference targets the ingest stores", () => {
    expect(seeTargets({ see: ["ਮਨੁ"] })).toEqual(["ਮਨੁ"]);
  });

  it("is empty for Mahan Kosh's origin-language refs or nothing", () => {
    expect(seeTargets({ origin_lang: "sa" })).toEqual([]);
    expect(seeTargets(null)).toEqual([]);
  });
});

describe("homographMark", () => {
  it("writes the homograph index as a superscript", () => {
    expect(homographMark(1)).toBe("¹");
    expect(homographMark(2)).toBe("²");
    expect(homographMark(12)).toBe("¹²");
  });
});
