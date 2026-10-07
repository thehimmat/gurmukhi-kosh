import { describe, it, expect } from "vitest";
import { triangulate } from "../pipeline/scans/triangulate";

describe("triangulate", () => {
  it("accepts a half-line all three sources share (spelling aside)", () => {
    const r = triangulate("ਸਭ ਕਰਤ ਹਰਿ ਕੀ ਸੇਵ", "ਸਭ ਕਰਤ ਹਰਿ ਕੀ ਸੇਵ", "ਸਭ ਕਰਤ ਹਰ ਕੀ ਸੇਵ");
    expect(r.verdict).toBe("agreed");
    expect(r.text).toBe("ਸਭ ਕਰਤ ਹਰਿ ਕੀ ਸੇਵ");
    expect(r.words).toEqual([]);
  });

  it("fixes a typing slip when print and critical edition agree against the typed text", () => {
    const r = triangulate(
      "ਕਿਤੇ ਚੁੱਪ ਹਾਥਾ ਕਿਤੇ ਤੁਨ ਭਾਥਾ",
      "ਕਿਤੇ ਚਾਂਪ ਹਾਥਾ ਕਿਤੇ ਤੁਨ ਭਾਥਾ",
      "ਕਿਤੇ ਚਾਂਪ ਹਾਥਾ ਕਿਤੇ ਤੂਨ ਭਾਥਾ",
    );
    expect(r.verdict).toBe("typing-slip");
    expect(r.text).toBe("ਕਿਤੇ ਚਾਂਪ ਹਾਥਾ ਕਿਤੇ ਤੁਨ ਭਾਥਾ");
    expect(r.words).toEqual([{ typed: "ਚੁੱਪ", print: "ਚਾਂਪ", ce: "ਚਾਂਪ", kind: "typing-slip" }]);
  });

  it("sends a recension difference (both Budha Dal sources against CE) to the manuscript", () => {
    const r = triangulate("ਜੁੱਗਣਿ ਬੀਰ ਰਨ ਖੰਡਲ", "ਜੁੱਗਣਿ ਬੀਰ ਰਨ ਖੰਡਲ", "ਜੁੱਗਣ ਬੀਰ ਰਨ ਮੰਡਲ");
    expect(r.verdict).toBe("manuscript");
    expect(r.text).toBe("ਜੁੱਗਣਿ ਬੀਰ ਰਨ ਖੰਡਲ");
    expect(r.words).toEqual([{ typed: "ਖੰਡਲ", print: "ਖੰਡਲ", ce: "ਮੰਡਲ", kind: "recension" }]);
  });

  it("sends a three-way disagreement to the manuscript", () => {
    const r = triangulate("ਫੂਲਨ ਲਾੜ ਲਤਾ", "ਫੂਲਨ ਲਾਡ ਲਤਾ", "ਫੂਲਨ ਲਾਲ ਲਤਾ");
    expect(r.verdict).toBe("manuscript");
    expect(r.words[0].kind).toBe("three-way");
  });

  it("treats a word the typed text dropped as a slip when print and CE both have it", () => {
    const r = triangulate("ਬਖਤਰ ਸਾਜੈ ਅਤਿ", "ਬਖਤਰ ਤਨ ਸਾਜੈ ਅਤਿ", "ਬਖਤਰ ਤਨ ਸਾਜੇ ਅਤ");
    expect(r.verdict).toBe("typing-slip");
    expect(r.text).toBe("ਬਖਤਰ ਤਨ ਸਾਜੈ ਅਤਿ");
    expect(r.words).toEqual([{ typed: "", print: "ਤਨ", ce: "ਤਨ", kind: "typing-slip" }]);
  });

  it("treats vowel-only differences between the editions as spelling, not as a reading", () => {
    const r = triangulate("ਸ੍ਰੀ ਮੁਖਿਵਾਕ੍ਯ ਸੋਹਿਲਾ ਈਸੁਰੀ ਫਤਿਹ", "ਸ੍ਰੀ ਮੁਖਿਵਾਕ੍ਯ ਸੌਹਿਲਾ ਈਸੁਰੀ ਫਤਿਹ", "ਸ੍ਰੀ ਮੁਖਬਾਕ ਸੋਹਲਾ ਈਸਰੀ ਫਤਹ");
    expect(r.verdict).toBe("agreed");
    expect(r.text).toBe("ਸ੍ਰੀ ਮੁਖਿਵਾਕ੍ਯ ਸੋਹਿਲਾ ਈਸੁਰੀ ਫਤਿਹ");
  });

  it("ignores number tokens and stray OCR symbols", () => {
    expect(triangulate("੧ ਸ੍ਰੀ ਵਾਹਿਗੁਰੂ", "੍ ਸ੍ਰੀ ਵਾਹਿਗੁਰੂ", "ਸ੍ਰੀ ਵਾਹਿਗੁਰੂ'").verdict).toBe("agreed");
  });

  it("reads the OCR's misplaced subscript ra (ਪਰ੍ਭ) as ਪ੍ਰਭ", () => {
    expect(triangulate("ਪ੍ਰਭੁ ਮਾਂਗਉ", "ਪ੍ਰਭੁ ਮਾਂਗਉ", "ਪਰ੍ਭ ਮਾਂਗਉ").verdict).toBe("agreed");
  });

  it("classifies a metre or raag label as a heading, not as a reading for the manuscript", () => {
    const r = triangulate("ਬਿਸਨੁਪਦ ਰਾਗੁ ਭੈਰਉ ਦੂਜੀ ਤਰਹ", "ਬਿਸਨੁਪਦ ਰਾਗੁ ਭੈਰਉ ਦੂਜੀ ਤਰਹ", "ਭੈਰੋ");
    expect(r.verdict).toBe("heading");
    expect(r.text).toBe("ਬਿਸਨੁਪਦ ਰਾਗੁ ਭੈਰਉ ਦੂਜੀ ਤਰਹ");
  });

  it("treats word division as spelling (CE joins compounds)", () => {
    expect(triangulate("ਬਿਖ ਜਾਲ ਹਰਨ ਮਦ ਸੂਦਨ", "ਬਿਖ ਜਾਲ ਹਰਨ ਮਦ ਸੂਦਨ", "ਬਿਖਜਾਲ ਹਰਨ ਮਦਸੂਦਨ").verdict).toBe("agreed");
  });

  it("treats ਰ-conjunct spellings as spelling (ਛਤ੍ਰ/ਛਤਰ, ਪਰਬਤ/ਪ੍ਰਬਤ, OCR ਪ੍ਜਾ)", () => {
    expect(triangulate("ਛਤ੍ਰ ਪਰਬਤ ਪ੍ਰਜਾ", "ਛਤ੍ਰ ਪਰਬਤ ਪ੍ਰਜਾ", "ਛਤਰ ਪ੍ਰਬਤ ਪ੍ਜਾ").verdict).toBe("agreed");
  });

  it("still sends a real one-word reading to the manuscript (ਦੁਖ/ਸੁਖ)", () => {
    expect(triangulate("ਹਰਤ ਦੁਖ ਸਭ", "ਹਰਤ ਦੁਖ ਸਭ", "ਹਰਤ ਸੁਖ ਸਭ").verdict).toBe("manuscript");
  });

  it("lists only the real reading when a half-line also differs in word division", () => {
    const r = triangulate("ਹਰਤ ਦੁਖ ਅਮਿਤ ਗਤਿ", "ਹਰਤ ਦੁਖ ਅਮਿਤ ਗਤਿ", "ਹਰਤ ਸੁਖ ਅਮਿਤਗਤ");
    expect(r.verdict).toBe("manuscript");
    expect(r.words.map((w) => w.typed)).toEqual(["ਦੁਖ"]);
  });

  it("keeps a nasal or subscript the OCR lost in both scans (shared OCR errors are not two witnesses)", () => {
    const r = triangulate("ਮਹਾਂ ਪ੍ਰਸਾਦਿ ਹ੍ਵੈ ਹੋਤ", "ਮਹਾ ਪ੍ਸਾਦਿ ਹੈ ਹੋਤ", "ਮਹਾ ਪ੍ਸਾਦਿ ਹੈ ਹੋਤ");
    expect(r.verdict).toBe("agreed");
    expect(r.text).toBe("ਮਹਾਂ ਪ੍ਰਸਾਦਿ ਹ੍ਵੈ ਹੋਤ");
  });

  it("still restores a subscript the typed text lost", () => {
    const r = triangulate("ਨਿਪ ਬਰ", "ਨ੍ਰਿਪ ਬਰ", "ਨ੍ਰਿਪ ਬਰ");
    expect(r.verdict).toBe("typing-slip");
    expect(r.text).toBe("ਨ੍ਰਿਪ ਬਰ");
  });

  it("does not 'correct' ਪ੍ਰਭੁ to the OCR's ਪਰ੍ਭੁ", () => {
    const r = triangulate("ਪ੍ਰਭੁ ਕਹ", "ਪਰ੍ਭੁ ਕਹ", "ਪਰ੍ਭੁ ਕਹ");
    expect(r.verdict).toBe("agreed");
    expect(r.text).toBe("ਪ੍ਰਭੁ ਕਹ");
  });

  it("does not 'fix' a word whose only difference is word division in both scans", () => {
    const r = triangulate("ਮਹਾ ਬਾਹੁ ਬੀਰ", "ਮਹਾਬਾਹੁ ਬੀਰ", "ਮਹਾਬਾਹੋ ਬੀਰ");
    expect(r.text).toBe("ਮਹਾ ਬਾਹੁ ਬੀਰ");
  });

  it("drops OCR punctuation from a corrected word", () => {
    expect(triangulate("ਸੁੰਦਰ ਮੋਹਨ", "ਸੁੰਦਰ ਮਨ-ਮੋਹਨ", "ਸੁੰਦਰ ਮਨਮੋਹਨ").text).toBe("ਸੁੰਦਰ ਮਨਮੋਹਨ");
  });

  it("only suggests a fix when the scans agree on consonants but not on spelling", () => {
    const r = triangulate("ਗੰਜ ਨੈਨ", "ਕੇਜ ਨੈਨ", "ਕੰਜ ਨੈਨ");
    expect(r.verdict).toBe("typing-slip");
    expect(r.text).toBe("ਗੰਜ ਨੈਨ");
    expect(r.words).toEqual([{ typed: "ਗੰਜ", print: "ਕੇਜ", ce: "ਕੰਜ", kind: "probable-slip" }]);
  });

  it("only suggests a fix when the OCR word is malformed (vowel sign before a subscript)", () => {
    const r = triangulate("ਦਿਨ ਦੇਖ", "ਦਿ੍ਗਨ ਦੇਖ", "ਦਿ੍ਗਨ ਦੇਖ");
    expect(r.text).toBe("ਦਿਨ ਦੇਖ");
    expect(r.words[0].kind).toBe("probable-slip");
  });

  it("fixes a typing slip even in a half-line that also has a reading for the manuscript", () => {
    const r = triangulate("ਚਰਮ ਸੇਲ ਦਾ ਖੰਡਲ", "ਚਰਮ ਸੇਲ ਗਦਾ ਖੰਡਲ", "ਚਰਮ ਸੇਲ ਗਦਾ ਮੰਡਲ");
    expect(r.verdict).toBe("manuscript");
    expect(r.text).toBe("ਚਰਮ ਸੇਲ ਗਦਾ ਖੰਡਲ");
  });

  it("never applies a fix that drops two or more consonants (a misaligned or split word)", () => {
    const r = triangulate("ਰਨ ਰੰਗਭੂਮਿ ਮਾਹਿ", "ਰਨ ਭੂਮਿ ਮਾਹਿ", "ਰਨ ਭੂਮਿ ਮਾਹਿ");
    expect(r.text).toBe("ਰਨ ਰੰਗਭੂਮਿ ਮਾਹਿ");
    expect(r.words.every((w) => w.kind !== "typing-slip")).toBe(true);
  });

  it("does not insert a word whose letters are already in the typed word beside it", () => {
    const r = triangulate("ਮਣਿਗਣ ਬਿਮਲ", "ਮਣਿ ਗਣ ਬਿਮਲ", "ਮਣਿ ਗਣ ਬਿਮਲ");
    expect(r.text).toBe("ਮਣਿਗਣ ਬਿਮਲ");
  });

  it("falls back to the manuscript when a source is missing", () => {
    const r = triangulate("ਪੈ ਪਾਯ ਸ਼ਰਨੀ ਆਇ", null, "ਢਹ ਪਏ ਸਰਨੀ ਆਇ");
    expect(r.verdict).toBe("manuscript");
  });

  it("sends a one-letter CE difference to the manuscript rather than waving it through as OCR noise", () => {
    // Real one-letter variants exist (ਖੰਡਲ/ਮੰਡਲ), so nothing is waved through on edit distance alone.
    const r = triangulate("ਸੇਸ ਸਹਸ ਗੁਨ ਰਵਤ", "ਸੇਸ ਸਹਸ ਗੁਨ ਰਵਤ", "ਸੇਸ ਸਹਸ ਗੁਨ ਰਵਲ");
    expect(r.verdict).toBe("manuscript");
  });
});
