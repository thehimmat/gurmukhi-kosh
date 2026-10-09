import { describe, it, expect } from "vitest";
import { caseEvidence } from "../lib/padarth/case-evidence";

// Glosses are verbatim from ss_padarth rows (SGGS verse ids noted). Sahib Singh
// names a case on only 81 of 50,054 pad-arth lines, but he renders the word into
// Punjabi with a postposition on thousands, and that postposition is evidence of
// how he read the word's case. It is evidence, never a declaration: the gloss is
// his, the inference from it is ours, so every result carries the marker and the
// segment it was read from.

describe("caseEvidence", () => {
  it("reads a segment-final postposition as the headword's case (verse 110)", () => {
    // ਦਰਗਹ = ਅਕਾਲ ਪੁਰਖ ਦੇ ਦਰਬਾਰ ਵਿਚ।
    expect(caseEvidence("ਅਕਾਲ ਪੁਰਖ ਦੇ ਦਰਬਾਰ ਵਿਚ।")).toEqual([
      { gramCase: "locative", marker: "ਵਿਚ", basis: "ਅਕਾਲ ਪੁਰਖ ਦੇ ਦਰਬਾਰ ਵਿਚ" },
    ]);
  });

  it("reads ਉੱਤੇ as locative (verse 185, ਤੀਰਥਿ)", () => {
    expect(caseEvidence("ਤੀਰਥ ਉੱਤੇ")).toEqual([
      { gramCase: "locative", marker: "ਉੱਤੇ", basis: "ਤੀਰਥ ਉੱਤੇ" },
    ]);
  });

  it("reads ਨਾਲ as instrumental, once, across repeating segments (verse 224, ਕਰਮੀ)", () => {
    // ਕਰਮੀ = ਕਰਮ ਨਾਲ, ਬਖ਼ਸ਼ਸ਼ ਨਾਲ।
    expect(caseEvidence("ਕਰਮ ਨਾਲ, ਬਖ਼ਸ਼ਸ਼ ਨਾਲ।")).toEqual([
      { gramCase: "instrumental", marker: "ਨਾਲ", basis: "ਕਰਮ ਨਾਲ" },
    ]);
  });

  it("reads ਤੋਂ as ablative (verse 234, ਬੰਦਿ)", () => {
    expect(caseEvidence("ਬੰਦੀ ਤੋਂ, ਮਾਇਆ ਦੇ ਮੋਹ ਤੋਂ।")).toEqual([
      { gramCase: "ablative", marker: "ਤੋਂ", basis: "ਬੰਦੀ ਤੋਂ" },
    ]);
  });

  it("reads ਨੂੰ as objective (verse 15, ਹੁਕਮੈ)", () => {
    expect(caseEvidence("ਹੁਕਮ ਨੂੰ।")).toEqual([
      { gramCase: "objective", marker: "ਨੂੰ", basis: "ਹੁਕਮ ਨੂੰ" },
    ]);
  });

  it("reads a leading ਹੇ as vocative (verse 233, ਦਾਤਾਰ)", () => {
    expect(caseEvidence("ਹੇ ਦੇਣਹਾਰ ਅਕਾਲ ਪੁਰਖ!")).toEqual([
      { gramCase: "vocative", marker: "ਹੇ", basis: "ਹੇ ਦੇਣਹਾਰ ਅਕਾਲ ਪੁਰਖ" },
    ]);
  });

  it("takes the first segment's locative and ignores a later segment with none (verse 11, ਹੁਕਮੀ)", () => {
    // ਹੁਕਮੀ = ਹੁਕਮ ਵਿਚ, ਅਕਾਲ ਪੁਰਖ ਦੇ ਹੁਕਮ ਅਨੁਸਾਰ।
    expect(caseEvidence("ਹੁਕਮ ਵਿਚ, ਅਕਾਲ ਪੁਰਖ ਦੇ ਹੁਕਮ ਅਨੁਸਾਰ।")).toEqual([
      { gramCase: "locative", marker: "ਵਿਚ", basis: "ਹੁਕਮ ਵਿਚ" },
    ]);
  });

  // The guard that matters: a postposition inside the gloss's own clause governs
  // a word in the gloss, not the headword. ਪੰਚ is not locative because ਸੁਰਤਿ is
  // ਨਾਮ ਵਿਚ. Only a segment-final postposition is the headword's own.
  it("ignores a postposition buried mid-clause (verse 109, ਪੰਚ)", () => {
    const gloss =
      "ਉਹ ਮਨੁੱਖ ਜਿਨ੍ਹਾਂ ਨਾਮ ਸੁਣਿਆ ਹੈ ਤੇ ਮੰਨਿਆ ਹੈ, ਉਹ ਮਨੁੱਖ ਜਿਨ੍ਹਾਂ ਦੀ ਸੁਰਤਿ ਨਾਮ ਵਿਚ ਜੁੜੀ ਹੈ ਤੇ ਜਿਨ੍ਹਾਂ ਦੇ ਅੰਦਰ ਪਰਤੀਤ ਆ ਗਈ ਹੈ।";
    expect(caseEvidence(gloss)).toEqual([]);
  });

  it("returns nothing for a plain nominal gloss (verse 110, ਮਾਨੁ)", () => {
    expect(caseEvidence("ਆਦਰ; ਵਡਿਆਈ।")).toEqual([]);
  });

  it("returns nothing for an adverbial gloss (verse 185, ਮਲਿ)", () => {
    expect(caseEvidence("ਮਲ ਮਲ ਕੇ, ਚੰਗੀ ਤਰ੍ਹਾਂ")).toEqual([]);
  });

  it("does not read a bare ਤੇ as locative, since it is also 'and'", () => {
    expect(caseEvidence("ਸੁਣਿਆ ਤੇ")).toEqual([]);
  });

  it("collects distinct cases from different segments", () => {
    expect(caseEvidence("ਹੁਕਮ ਵਿਚ, ਕਰਮ ਨਾਲ।")).toEqual([
      { gramCase: "locative", marker: "ਵਿਚ", basis: "ਹੁਕਮ ਵਿਚ" },
      { gramCase: "instrumental", marker: "ਨਾਲ", basis: "ਕਰਮ ਨਾਲ" },
    ]);
  });

  // ਤਨਿ is locative ("in the body"); the ਦੇ trailing "ਸਰੀਰ ਵਿਚ ਦੇ" is a dangling
  // modifier, not the headword's case. Genitive is the weakest signal, since
  // ਦਾ/ਦੇ/ਦੀ pervade Punjabi noun phrases, so a stronger marker in the same
  // segment wins (verse 69).
  it("prefers a stronger marker over a trailing genitive (verse 69, ਤਨਿ)", () => {
    expect(caseEvidence("ਸਰੀਰ ਵਿਚ ਦੇ")).toEqual([
      { gramCase: "locative", marker: "ਵਿਚ", basis: "ਸਰੀਰ ਵਿਚ ਦੇ" },
    ]);
  });

  it("still reports genitive when it is the only marker (verse 79)", () => {
    expect(caseEvidence("ਗੁਣਾਂ ਦੇ ਸਰੋਵਰਾਂ ਦੇ")).toEqual([
      { gramCase: "genitive", marker: "ਦੇ", basis: "ਗੁਣਾਂ ਦੇ ਸਰੋਵਰਾਂ ਦੇ" },
    ]);
  });

  // Sahib Singh discusses grammar in prose on some lines, quoting the words he
  // is talking about. Quoted metalanguage is discussion, not a gloss of the
  // headword, so it yields no case (verse 31, inside the ਸਾਚੁ ਨਾਇ note).
  it("ignores a segment containing quoted metalanguage (verse 31)", () => {
    expect(caseEvidence("ਜੋ ਉਸ 'ਨਾਂਵ' ਦਾ")).toEqual([]);
  });

  it("handles an empty or punctuation-only gloss", () => {
    expect(caseEvidence("")).toEqual([]);
    expect(caseEvidence("।")).toEqual([]);
  });

  it("ignores a trailing parenthetical when finding the final postposition", () => {
    // ਨਾਉ = ਇਸ਼ਨਾਨ (ਕੀਤਾ ਹੈ)  → no case; but a parenthetical must not hide one
    expect(caseEvidence("ਇਸ਼ਨਾਨ (ਕੀਤਾ ਹੈ)")).toEqual([]);
    expect(caseEvidence("ਮਨ ਵਿਚ (ਭਾਵ)")).toEqual([
      { gramCase: "locative", marker: "ਵਿਚ", basis: "ਮਨ ਵਿਚ" },
    ]);
  });
});
