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
