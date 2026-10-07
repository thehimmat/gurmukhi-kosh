import { describe, it, expect } from "vitest";
import { segmentLike, assemble, applySlips, type Verdict } from "../pipeline/scans/assemble";

describe("segmentLike", () => {
  it("restores word division to a larivaar reading using a reference half-line", () => {
    expect(segmentLike("ਢਹਿਪਏਸਰਨੀਆਇ", "ਢਹ ਪਏ ਸਰਨੀ ਆਇ")).toBe("ਢਹਿ ਪਏ ਸਰਨੀ ਆਇ");
  });

  it("keeps the manuscript's own letters where they differ from the reference", () => {
    expect(segmentLike("ਸਭਕਰਤਹਰਕੀਸੇਵ", "ਸਭ ਕਰਤ ਹਰਿ ਕੀ ਸੇਵ")).toBe("ਸਭ ਕਰਤ ਹਰ ਕੀ ਸੇਵ");
  });

  it("falls back to the unsegmented reading when the reference shares too little", () => {
    expect(segmentLike("ਕਖਗਘ", "ਸਰਬ ਲੋਹ")).toBe("ਕਖਗਘ");
  });
});

describe("assemble", () => {
  const base = [
    { text: "ਇਕ ਆਸ ਤੁਮ ਜਗਮਾਇ", ref: null },
    { text: "ਪੈ ਪਾਯ ਸ਼ਰਨੀ ਆਇ", ref: null },
    { text: "ਸਭ ਕਰਤ ਹਰਿ ਕੀ ਸੇਵ", ref: "110" },
  ];
  const verdicts: Verdict[] = [
    { pada: 1, bd: "ਪੈ ਪਾਯ ਸ਼ਰਨੀ ਆਇ", ce: "ਢਹ ਪਏ ਸਰਨੀ ਆਇ", ms: "ਢਹਿਪਏਸਰਨੀਆਇ", supports: "CE", confidence: "high", page: 74 },
    { pada: 2, bd: "ਸਭ ਕਰਤ ਹਰਿ ਕੀ ਸੇਵ", ce: "ਸਭ ਕਰਤ ਮਾਇਆ ਸੇਵ", ms: "ਸਭਕਰਤਹਰਕੀਸੇਵ", supports: "BD", confidence: "high", page: 74 },
  ];

  it("keeps the base where the manuscript supports it and takes the manuscript reading otherwise", () => {
    const { text } = assemble(base, verdicts);
    expect(text.map((p) => p.text)).toEqual(["ਇਕ ਆਸ ਤੁਮ ਜਗਮਾਇ", "ਢਹਿ ਪਏ ਸਰਨੀ ਆਇ", "ਸਭ ਕਰਤ ਹਰਿ ਕੀ ਸੇਵ"]);
    expect(text[2].ref).toBe("110");
  });

  it("records every reading as a witness variant with its source", () => {
    const { variants } = assemble(base, verdicts);
    expect(variants).toHaveLength(2);
    expect(variants[0]).toMatchObject({
      pada: 1,
      canonical: "ਢਹਿ ਪਏ ਸਰਨੀ ਆਇ",
      readings: { ms1878: "ਢਹਿਪਏਸਰਨੀਆਇ", budhaDal: "ਪੈ ਪਾਯ ਸ਼ਰਨੀ ਆਇ", criticalEdition: "ਢਹ ਪਏ ਸਰਨੀ ਆਇ" },
      supports: "CE",
      page: 74,
      needsReview: false,
    });
  });

  it("flags low-confidence and unreadable verdicts for review and keeps the base text", () => {
    const { text, variants } = assemble(base, [{ ...verdicts[0], confidence: "low" }, { ...verdicts[1], supports: "unreadable", ms: "" }]);
    expect(text[1].text).toBe("ਢਹਿ ਪਏ ਸਰਨੀ ਆਇ");
    expect(variants[0].needsReview).toBe(true);
    expect(text[2].text).toBe("ਸਭ ਕਰਤ ਹਰਿ ਕੀ ਸੇਵ");
    expect(variants[1].needsReview).toBe(true);
  });

  it("flags a manuscript reading that runs past one half-line (it contains a danda)", () => {
    const { variants } = assemble(base, [{ ...verdicts[0], ms: "ਢਹਿਪਏਸਰਨੀਆਇ।ਕਬੈਸਰਸ", supports: "CE", confidence: "high" }]);
    expect(variants[0].needsReview).toBe(true);
  });

  it("marks a half-line the manuscript lacks instead of deleting it", () => {
    const { text, variants } = assemble(base, [{ ...verdicts[0], supports: "absent", ms: "" }]);
    expect(text[1]).toMatchObject({ text: "ਪੈ ਪਾਯ ਸ਼ਰਨੀ ਆਇ", absentInMs: true });
    expect(variants[0].needsReview).toBe(true);
  });
});

describe("applySlips", () => {
  const canon = [
    { text: "ਕਿਤੇ ਚੁੱਪ ਹਾਥਾ", ref: null },
    { text: "ਢਹਿ ਪਏ ਸਰਨੀ ਆਇ", ref: "1" },
  ];
  const slips = [
    { pada: 0, text: "ਕਿਤੇ ਚਾਂਪ ਹਾਥਾ", words: [{ typed: "ਚੁੱਪ", print: "ਚਾਂਪ", ce: "ਚਾਂਪ", kind: "typing-slip" as const }] },
    { pada: 1, text: "ਪੈ ਪਾਯ ਸਰਨੀ ਆਇ", words: [{ typed: "ਸ਼ਰਨੀ", print: "ਸਰਨੀ", ce: "ਸਰਨੀ", kind: "typing-slip" as const }] },
  ];

  it("corrects typing slips the manuscript did not rule on and lists each fix", () => {
    const { text, fixes } = applySlips(canon, slips, new Set([1]));
    expect(text.map((p) => p.text)).toEqual(["ਕਿਤੇ ਚਾਂਪ ਹਾਥਾ", "ਢਹਿ ਪਏ ਸਰਨੀ ਆਇ"]);
    expect(fixes).toEqual([{ pada: 0, from: "ਚੁੱਪ", to: "ਚਾਂਪ" }]);
  });

  it("keeps the verse number", () => {
    expect(applySlips(canon, slips, new Set()).text[1]).toEqual({ text: "ਪੈ ਪਾਯ ਸਰਨੀ ਆਇ", ref: "1" });
  });
});
