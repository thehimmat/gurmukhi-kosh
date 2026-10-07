/**
 * Resolving Shackle cross-references to Gurmukhi entries at ingest (#131).
 * Run: npm test
 */

import { describe, it, expect } from "vitest";
import { buildCrossRefIndex, resolveCrossRefs, type CrossRefEntry } from "../pipeline/shackle/cross-refs";

const entry = (e: Partial<CrossRefEntry> & Pick<CrossRefEntry, "gurmukhi" | "headword">): CrossRefEntry => ({
  gloss: "",
  glossIsCrossRefOnly: false,
  ...e,
});

const MANU = entry({
  gurmukhi: "ਮਨੁ",
  headword: "manu",
  gloss: "mind; intelligence",
  inflectionsRaw: "(-aṁ, -o; so. mana¹, manna; sl. mani, manni¹)",
});
const MANA1 = entry({ gurmukhi: "ਮਨ", headword: "mana", homonymIndex: 1, glossIsCrossRefOnly: true, inflectionsRaw: "manna" });
const MANA2 = entry({ gurmukhi: "ਮਨ", headword: "mana", homonymIndex: 2, gloss: "I, my" });
const SARU1 = entry({ gurmukhi: "ਸਰੁ", headword: "saru", homonymIndex: 1, gloss: "lake" });
const SAR = entry({ gurmukhi: "ਸਰ", headword: "sara", gloss: "lake': see SARU¹" });
const index = buildCrossRefIndex([MANU, MANA1, MANA2, SARU1, SAR]);

describe("resolveCrossRefs", () => {
  // ਮਨ is printed as mana¹, a cross-reference whose target the extraction
  // dropped; ਮਨੁ lists mana¹ among its inflected forms.
  it("resolves a gloss-less cross-reference through the entry that inflects to it", () => {
    expect(resolveCrossRefs(MANA1, index)).toEqual(["ਮਨੁ"]);
  });

  it("matches the homonym number, so mana² does not inherit mana¹'s target", () => {
    expect(resolveCrossRefs(MANA2, index)).toEqual([]);
  });

  it("resolves Shackle's printed 'see HEADWORD¹' pointers", () => {
    expect(resolveCrossRefs(SAR, index)).toEqual(["ਸਰੁ"]);
  });

  it("never points an entry at itself", () => {
    const self = entry({ gurmukhi: "ਮਨੁ", headword: "manu", gloss: "see MANU" });
    expect(resolveCrossRefs(self, buildCrossRefIndex([MANU, self]))).toEqual([]);
  });

  it("returns nothing for an unknown target rather than guessing", () => {
    const lost = entry({ gurmukhi: "ਕਖ", headword: "kakha", glossIsCrossRefOnly: true });
    expect(resolveCrossRefs(lost, index)).toEqual([]);
  });
});
