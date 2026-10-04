import { describe, it, expect } from "vitest";
import { toMorphVariants, type SiblingFormRow } from "../lib/morph-variants";

// Related forms come only from word_forms memberships a source asserts (#30
// feed 1: Shackle inflection notes, #18). The label is the source's own
// wording; nothing is derived from the form's ending at read time (#56).

const sib = (gurmukhi: string, p: Partial<SiblingFormRow> = {}): SiblingFormRow => ({
  source_code: "shackle",
  label_raw: null,
  words: { gurmukhi },
  ...p,
});

describe("toMorphVariants", () => {
  it("lists sibling forms with the source's own label and source", () => {
    expect(toMorphVariants([sib("ਹੋਵੈ", { label_raw: "pres. 3s." })], "ਹੋਇ")).toEqual([
      { gurmukhi: "ਹੋਵੈ", label: "pres. 3s.", sourceCode: "shackle" },
    ]);
  });

  it("leaves the label empty when the source gives none, rather than deriving one", () => {
    expect(toMorphVariants([sib("ਹੁਕਮਿ")], "ਹੁਕਮੁ")).toEqual([
      { gurmukhi: "ਹੁਕਮਿ", label: null, sourceCode: "shackle" },
    ]);
  });

  it("drops a membership no source asserts (legacy stem grouping)", () => {
    expect(toMorphVariants([sib("ਹੁਕਮਿ", { source_code: null })], "ਹੁਕਮੁ")).toEqual([]);
  });

  it("skips the word itself and dedupes repeated siblings, keeping the first label", () => {
    const variants = toMorphVariants(
      [sib("ਹੁਕਮੁ"), sib("ਹੁਕਮਿ", { label_raw: "loc. s." }), sib("ਹੁਕਮਿ", { label_raw: "obl. s." })],
      "ਹੁਕਮੁ"
    );
    expect(variants).toEqual([{ gurmukhi: "ਹੁਕਮਿ", label: "loc. s.", sourceCode: "shackle" }]);
  });

  it("skips a row whose word did not resolve", () => {
    expect(toMorphVariants([sib("x", { words: null })], "ਹੁਕਮੁ")).toEqual([]);
  });
});
