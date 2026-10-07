import { describe, it, expect } from "vitest";
import { buildApparatus } from "../pipeline/scans/apparatus";
import type { Verdict } from "../pipeline/scans/assemble";

const base = [
  { text: "ਪੈ ਪਾਯ ਸ਼ਰਨੀ ਆਇ", ref: null }, // 0: MS sides with CE
  { text: "ਸਭ ਕਰਤ ਹਰਿ ਕੀ ਸੇਵ", ref: "1" }, // 1: MS sides with BD
  { text: "ਹਰਤ ਦੁਖ ਸਭ", ref: null }, // 2: MS has its own reading
  { text: "ਕਹੌ ਦੂਤ ਹੇਤੰ", ref: "2" }, // 3: not in MS
  { text: "ਜਲੰ ਥਲੰ ਗਿਰੰ", ref: null }, // 4: CE OCR noise only
  { text: "ਅਚਲ ਅਥਾਹ ਅਗਮ", ref: null }, // 5: unchecked, CE differs
  { text: "ਨਮੋ ਨਮੋ", ref: null }, // 6: unchecked, same
  { text: "ਸਤਿ ਸਤਿ", ref: "3" }, // 7: unchecked, no CE line
];
const verdict = (pada: number, ms: string, supports: Verdict["supports"], ce: string | null, confidence: Verdict["confidence"] = "high"): Verdict => ({
  pada,
  bd: base[pada].text,
  ce,
  ms,
  supports,
  confidence,
  page: 74,
});
const verdicts: Verdict[] = [
  verdict(0, "ਢਹਿਪਏਸਰਨੀਆਇ", "CE", "ਢਹ ਪਏ ਸਰਨੀ ਆਇ"),
  verdict(1, "ਸਭਕਰਤਹਰਕੀਸੇਵ", "BD", "ਸਭ ਕਰਤ ਮਾਇਆ ਸੇਵ"),
  verdict(2, "ਹਰਤਸੋਕਸਭ", "neither", "ਹਰਤ ਸੁਖ ਸਭ"),
  verdict(3, "", "absent", null),
  verdict(4, "ਜਲੰਥਲੰਗਿਰੰ", "both", "ਜਲੰ ਥਲੰ ਗਿਰੰ'"),
];
const collation = [
  { base: 5, otherText: "ਅਚਲ ਅਥਾਹ ਅਗੰਮ", band: "probable" },
  { base: 6, otherText: "ਨਮੋ ਨਮੋ", band: "same" },
  { base: 7, otherText: null, band: "missing" },
];

describe("buildApparatus", () => {
  const app = buildApparatus({ base, collation, verdicts });
  const at = (pada: number) => app.find((e) => e.pada === pada);

  it("notes where the manuscript and the critical edition agree against Budha Dal", () => {
    expect(at(0)).toMatchObject({ kind: "ms-agrees-with-ce", significant: true, canonical: "ਪੈ ਪਾਯ ਸ਼ਰਨੀ ਆਇ" });
    expect(at(0)!.note).toContain("ਢਹਿਪਏਸਰਨੀਆਇ");
    expect(at(0)!.note).toContain("ਢਹ ਪਏ ਸਰਨੀ ਆਇ");
  });

  it("notes a reading only the manuscript has", () => {
    expect(at(2)).toMatchObject({ kind: "ms-own-reading", significant: true });
    expect(at(2)!.note).toContain("ਹਰਤਸੋਕਸਭ");
  });

  it("notes a half-line the manuscript lacks, saying whether the critical edition has it", () => {
    expect(at(3)).toMatchObject({ kind: "not-in-ms", significant: true });
    expect(at(3)!.note).toMatch(/critical edition.*(not|either)/i);
  });

  it("records a critical-edition difference the manuscript does not support, without calling it significant", () => {
    expect(at(1)).toMatchObject({ kind: "ce-differs", significant: false, readings: { criticalEdition: "ਸਭ ਕਰਤ ਮਾਇਆ ਸੇਵ", ms1878: "ਸਭਕਰਤਹਰਕੀਸੇਵ" } });
  });

  it("records OCR noise in the critical edition without a note", () => {
    expect(at(4)).toMatchObject({ kind: "ce-ocr", significant: false });
    expect(at(4)!.note).toBeUndefined();
  });

  it("records unchecked differences from the collation: a differing line, and a line missing from the critical edition", () => {
    expect(at(5)).toMatchObject({ kind: "ce-differs", significant: false, checked: false, readings: { criticalEdition: "ਅਚਲ ਅਥਾਹ ਅਗੰਮ" } });
    expect(at(6)).toBeUndefined();
    expect(at(7)).toMatchObject({ kind: "not-in-ce", significant: false, checked: false });
  });

  it("marks a low-confidence manuscript reading as uncertain", () => {
    const a = buildApparatus({ base, collation: [], verdicts: [verdict(0, "ਢਹਿਪਏਸਰਨੀਆਇ", "CE", "ਢਹ ਪਏ ਸਰਨੀ ਆਇ", "low")] });
    expect(a[0].note).toMatch(/uncertain/);
  });

  it("lets a research note also correct the kind and the readings (e.g. a misaligned check)", () => {
    const a = buildApparatus({
      base,
      collation: [],
      verdicts: [verdict(2, "ਲੈਆਯੋਹੈਪੱਤ੍ਰਕ", "neither", "ਬਿਸਨਪਦ ਕਾਫੀ")],
      research: { 2: { note: "Only Budha Dal has this line.", kind: "not-in-ms", readings: { ms1878: "", criticalEdition: null } } },
    });
    expect(a[0]).toMatchObject({ kind: "not-in-ms", significant: true, note: "Only Budha Dal has this line.", readings: { ms1878: "", criticalEdition: null } });
  });

  it("puts a research note in place of the automatic one, and adds the reviewer's note", () => {
    const a = buildApparatus({
      base,
      collation: [],
      verdicts,
      research: { 3: "A couplet only Budha Dal has; the 1878 bir and CE go straight on." },
      reviewNotes: { 3: "checked", 1: "wording differs in other versions" },
    });
    expect(a.find((e) => e.pada === 3)!.note).toBe("A couplet only Budha Dal has; the 1878 bir and CE go straight on. Reviewer: checked");
    expect(a.find((e) => e.pada === 1)).toMatchObject({ significant: true, note: expect.stringContaining("Reviewer: wording differs in other versions") });
  });
});
