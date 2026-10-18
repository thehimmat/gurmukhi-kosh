import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { parseGhazals, cleanMisra, composeNukta, toLines, sherPosition, GHAZAL_SHABAD_BASE } from "../pipeline/nand-lal/ghazals";

// Gurmukhi literals here are saved decomposed (ਖ + nukta); the parser writes ਖ਼ ਗ਼ ਜ਼ ਫ਼ ਸ਼ precomposed.
const g = composeNukta;

// Ghazals 1-3 of "Ghazals Bhai Nand Laal Goyaa Complete.pdf" as converted from GurbaniAkhar, then
// the heading of the rubai that follows ghazal 63.
const fixture = readFileSync("tests/fixtures/nand-lal-ghazals.txt", "utf8");

describe("cleanMisra", () => {
  it("drops the edition's punctuation but keeps ਕਿ: and hyphens inside words", () => {
    expect(cleanMisra("ਬਗੋ 'ਗੋਇਆ', ਕੁਜਾ ਬੁਗੁਜ਼ਾਰਮ, ਈਂ ਦੁਨੀਆ ਓ")).toBe(g("ਬਗੋ ਗੋਇਆ ਕੁਜਾ ਬੁਗੁਜ਼ਾਰਮ ਈਂ ਦੁਨੀਆ ਓ"));
    expect(cleanMisra("ਖ਼ੁਸ਼ ਅਸ੍ਤ ਉਮਰ ਕਿ: ਦਰ ਯਾਦ ਬਿਗੁਜ਼ਰਦ, ਵਰਨਾ --")).toBe(g("ਖ਼ੁਸ਼ ਅਸ੍ਤ ਉਮਰ ਕਿ: ਦਰ ਯਾਦ ਬਿਗੁਜ਼ਰਦ ਵਰਨਾ"));
    expect(cleanMisra("ਯਕ ਲਹਜ਼ਾ, ਅਗਰ ਗਿਰਾ ਕੁਸ਼ਾਈ, ਚਿ: ਸ਼ਵੱਦ ?")).toBe(g("ਯਕ ਲਹਜ਼ਾ ਅਗਰ ਗਿਰਾ ਕੁਸ਼ਾਈ ਚਿ: ਸ਼ਵੱਦ"));
    expect(cleanMisra("ਜਰਸ ਬੇਹੂਦਾ ਮੇ-ਨਾਲਦ, ਕੁਜਾ ਬੰਦੇਮ ਮਹਮਿਲ-ਹਾ")).toBe(g("ਜਰਸ ਬੇਹੂਦਾ ਮੇ-ਨਾਲਦ ਕੁਜਾ ਬੰਦੇਮ ਮਹਮਿਲ-ਹਾ"));
  });

  it("writes nukta letters as the corpus does: precomposed where Unicode has them, else without the nukta", () => {
    expect(cleanMisra("ਖ਼ੁਦਾ")).toBe(g("ਖ਼ੁਦਾ")); // decomposed ਖ਼ → precomposed
    expect(cleanMisra("ਸਾਕ਼ੀ")).toBe(g("ਸਾਕੀ")); // ਕ਼ (qaf) has no precomposed form
    expect(cleanMisra("ਅ਼ਾਲਮ")).toBe(g("ਆਲਮ")); // ain: ਅ + ਾ is written ਆ
    expect(cleanMisra("ਜ਼ੂਕਿ਼")).toBe(g("ਜ਼ੂਕਿ")); // the converter puts the nukta after the vowel sign
    expect(cleanMisra("ਜ਼ੂਕਿ਼")).not.toMatch(/਼/);
  });

  it("joins a word broken across lines by a trailing hyphen", () => {
    expect(cleanMisra("ਦਰ ਖ਼ਾਨਾ-\nਇ ਦਿਲ")).toBe(g("ਦਰ ਖ਼ਾਨਾ-ਇ ਦਿਲ"));
    expect(cleanMisra("ਈਂ ਜੁਮਲਾ\nਮੁਸ਼ਕਿਲ-ਹਾ")).toBe(g("ਈਂ ਜੁਮਲਾ ਮੁਸ਼ਕਿਲ-ਹਾ"));
  });
});

describe("parseGhazals", () => {
  const misras = parseGhazals(fixture);

  it("reads every ghazal and stops at the rubai after the last one", () => {
    expect([...new Set(misras.map((m) => m.ghazal))]).toEqual([1, 2, 3]);
    expect(misras.every((m) => !m.text.includes("ਰੁਬਾਈ") && !m.text.includes("ਅਸ਼ਨਾਏ"))).toBe(true);
  });

  it("gives two misras per sher, numbered as printed", () => {
    const shers = (g: number) => misras.filter((m) => m.ghazal === g && m.misra === 1).map((m) => m.sher);
    expect(shers(1)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(shers(2)).toEqual([1, 2, 3, 4, 5]);
    expect(shers(3)).toEqual([1, 2, 3, 4, 5]);
    expect(misras).toHaveLength(32);
  });

  it("splits a sher at its danda, or at a closing '--'", () => {
    const g1 = misras.filter((m) => m.ghazal === 1);
    expect(g1[0].text).toBe(g("ਹਵਾਏ ਬੰਦਗੀ ਆਵੁਰਦ ਦਰ ਵਜੂਦ ਮਰਾ"));
    expect(g1[1].text).toBe(g("ਵਗਰਨਹ ਜ਼ੂਕਿ ਚੁਨੀਂ ਆਮਦਨ ਨਬੂਦ ਮਰਾ"));
    expect(g1[2].text).toBe(g("ਖ਼ੁਸ਼ ਅਸ੍ਤ ਉਮਰ ਕਿ: ਦਰ ਯਾਦ ਬਿਗੁਜ਼ਰਦ ਵਰਨਾ"));
    expect(g1[3].text).toBe(g("ਚਿ ਹਾਸਿਲ ਅਸ੍ਤ ਅਜ਼ੀਂ ਗੁੰਬਦਿ ਕਬੂਦ ਮਰਾ"));
  });

  it("rejoins misras that the PDF wrapped onto a second line", () => {
    const g3 = misras.filter((m) => m.ghazal === 3);
    expect(g3[1].text).toBe(g("ਬ-ਚਸ਼ਮਿ ਪਾਕ ਬੀਂ ਆਸਾਂਅ ਕੁਨਮ ਈਂ ਜੁਮਲਾ ਮੁਸ਼ਕਿਲ-ਹਾ"));
    expect(g3[8].text).toBe(g("ਚੂੰ ਗ਼ੈਰ ਅਜ਼ ਜ਼ਾਤਿ ਪਾਕਸ਼ ਨੇਸ੍ਤ ਦਰ ਹਰ ਜਾ ਕਿ: ਮੇ ਬੀਨਮ"));
    expect(g3[9].text).toBe(g("ਬਗੋ ਗੋਇਆ ਕੁਜਾ ਬੁਗੁਜ਼ਾਰਮ ਈਂ ਦੁਨੀਆ ਓ ਅਹਲਿਲ-ਹਾ"));
  });

  it("accepts mistyped sher marks (।੧॥) and a mark on a line of its own", () => {
    const m = parseGhazals(
      [
        "ਗ਼ਜ਼ਲ ੧",
        "ਚੂੰ ਮਾਹਿ ਦੋ ਹਫ਼ਤਾ, ਰੂ-ਨੁਮਾਈ, ਚਿ: ਸ਼ਵੱਦ ?",
        "ਇਮ-ਸ਼ਬ ਮਹਿ ਮਨ, ਅਗਰ ਬਿਆਈ, ਚਿ: ਸ਼ਵੱਦ ?",
        "।੧॥",
        "ਈਂ ਜੁਮਲਹ ਜਹਾਂ, ਅਸੀਰਿ ਜ਼ੁਲਫ਼ਤ ਗ਼ਸ਼ਤਹ ।",
        "ਯਕ ਲਹਜ਼ਾ, ਅਗਰ ਗਿਰਾ ਕੁਸ਼ਾਈ, ਚਿ: ਸ਼ਵੱਦ ? ।੨॥",
      ].join("\n"),
    );
    expect(m.map((x) => x.text)).toEqual([
      "ਚੂੰ ਮਾਹਿ ਦੋ ਹਫ਼ਤਾ ਰੂ-ਨੁਮਾਈ ਚਿ: ਸ਼ਵੱਦ",
      "ਇਮ-ਸ਼ਬ ਮਹਿ ਮਨ ਅਗਰ ਬਿਆਈ ਚਿ: ਸ਼ਵੱਦ",
      "ਈਂ ਜੁਮਲਹ ਜਹਾਂ ਅਸੀਰਿ ਜ਼ੁਲਫ਼ਤ ਗ਼ਸ਼ਤਹ",
      "ਯਕ ਲਹਜ਼ਾ ਅਗਰ ਗਿਰਾ ਕੁਸ਼ਾਈ ਚਿ: ਸ਼ਵੱਦ",
    ].map(g));
  });

  it("splits at a ॥ typed between the misras, or at the line break when a two-line sher has no mark", () => {
    const m = parseGhazals(
      [
        "ਗ਼ਜ਼ਲ ੧",
        "ਗੁਲਾਬੋ, ਅੰਬਰੋ, ਮੁਸ਼ਕੋ ਅਬੀਰੇ ॥",
        "ਚੁ ਬਾਰਾਂ, ਬਾਰਿਸ਼ੇ ਅਜ਼ ਸੂ ਬਸੂ ਕਰਦ ॥੧॥",
        "ਦਰ ਹਿਜਰਿ ਤੁਸ੍ਤ, ਜਾਨੋ ਦਿਲਿ ਆਸ਼ਿਕਾਂ ਚੁਨੀਂ",
        "ਚੂੰ ਲਾਲਹ ਦਾਗ਼ ਬਰ ਜਿਗਰੋ ਸੀਨਾ ਚਾਕ ਚਾਕ ॥੨॥",
      ].join("\n"),
    );
    expect(m.map((x) => [x.sher, x.misra, x.text])).toEqual(([
      [1, 1, "ਗੁਲਾਬੋ ਅੰਬਰੋ ਮੁਸ਼ਕੋ ਅਬੀਰੇ"],
      [1, 2, "ਚੁ ਬਾਰਾਂ ਬਾਰਿਸ਼ੇ ਅਜ਼ ਸੂ ਬਸੂ ਕਰਦ"],
      [2, 1, "ਦਰ ਹਿਜਰਿ ਤੁਸ੍ਤ ਜਾਨੋ ਦਿਲਿ ਆਸ਼ਿਕਾਂ ਚੁਨੀਂ"],
      [2, 2, "ਚੂੰ ਲਾਲਹ ਦਾਗ਼ ਬਰ ਜਿਗਰੋ ਸੀਨਾ ਚਾਕ ਚਾਕ"],
    ] as const).map(([s, k, t]) => [s, k, g(t)]));
  });

  it("prefers a danda that ends a line to one inside a misra (ghazal 34's ਐ ਜ਼ਹੇ ।)", () => {
    const m = parseGhazals(
      ["ਗ਼ਜ਼ਲ ੧", "ਐ ਜ਼ਹੇ । ਸੇਬਿ ਜ਼ਨੁਖ਼ਦਾਨਿ ਸ਼ੁਮਾ ।", "ਮੇਵਾ ਚੂੰ ਦਰ ਬੋਸਤਾਂ ਬਾਸ਼ਦ ਲਜ਼ੀਜ਼ ॥੧॥"].join("\n"),
    );
    expect(m.map((x) => x.text)).toEqual(["ਐ ਜ਼ਹੇ ਸੇਬਿ ਜ਼ਨੁਖ਼ਦਾਨਿ ਸ਼ੁਮਾ", "ਮੇਵਾ ਚੂੰ ਦਰ ਬੋਸਤਾਂ ਬਾਸ਼ਦ ਲਜ਼ੀਜ਼"].map(g));
  });

  it("refuses a sher or ghazal out of sequence, and a sher it cannot split in two", () => {
    expect(() => parseGhazals("ਗ਼ਜ਼ਲ ੧\nਅਲਿਫ਼ ਬੇ ।\nਪੇ ਤੇ ॥੨॥")).toThrow(/ghazal 1: sher 2 where 1/);
    expect(() => parseGhazals("ਗ਼ਜ਼ਲ ੨\nਅਲਿਫ਼ ਬੇ ।\nਪੇ ਤੇ ॥੧॥")).toThrow(/ghazal 2 where 1/);
    expect(() => parseGhazals("ਗ਼ਜ਼ਲ ੧\nਅਲਿਫ਼ ਬੇ\nਪੇ ਤੇ\nਸੇ ਜੀਮ ॥੧॥")).toThrow(/ghazal 1, sher 1: cannot split/);
    expect(() => parseGhazals("ਗ਼ਜ਼ਲ ੧\nਅਲਿਫ਼ ਬੇ ।\nਪੇ ਤੇ ॥੧॥\nਸੇ ਜੀਮ ।")).toThrow(/ghazal 1: unfinished sher/);
  });
});

describe("toLines", () => {
  const lines = toLines(parseGhazals(fixture));

  it("numbers misras through the whole source; ang is the ghazal; one shabad per ghazal", () => {
    expect(lines.map((l) => l.line_no)).toEqual(lines.map((_, i) => i + 1));
    expect(lines.map((l) => l.verse_id)).toEqual(lines.map((l) => l.line_no));
    expect(lines[12]).toMatchObject({ line_no: 13, ang: 2, shabad_id: GHAZAL_SHABAD_BASE + 2 });
    expect(new Set(lines.map((l) => l.shabad_id))).toEqual(new Set([910001, 910002, 910003]));
  });

  it("ends the first misra with । and the second with its sher number", () => {
    expect(lines[0].gurmukhi).toBe(g("ਹਵਾਏ ਬੰਦਗੀ ਆਵੁਰਦ ਦਰ ਵਜੂਦ ਮਰਾ ।"));
    expect(lines[1].gurmukhi).toBe(g("ਵਗਰਨਹ ਜ਼ੂਕਿ ਚੁਨੀਂ ਆਮਦਨ ਨਬੂਦ ਮਰਾ ॥੧॥"));
    expect(lines[11].gurmukhi).toBe(g("ਬਸੂਏ ਦੋਸਤ ਰਿਹਾਈ ਦਿਹੰਦ ਜ਼ੂਦ ਮਰਾ ॥੬॥"));
  });
});

describe("sherPosition", () => {
  it("recovers sher and misra from a row's position within its ghazal (1-based)", () => {
    expect(sherPosition(1)).toEqual({ sher: 1, misra: 1 });
    expect(sherPosition(2)).toEqual({ sher: 1, misra: 2 });
    expect(sherPosition(11)).toEqual({ sher: 6, misra: 1 });
    expect(sherPosition(12)).toEqual({ sher: 6, misra: 2 });
  });

  it("agrees with every stored row", () => {
    const lines = toLines(parseGhazals(fixture));
    const misras = parseGhazals(fixture);
    for (const [i, l] of lines.entries()) {
      const k = l.line_no - lines.findIndex((x) => x.ang === l.ang);
      expect(sherPosition(k)).toEqual({ sher: misras[i].sher, misra: misras[i].misra });
    }
  });
});
