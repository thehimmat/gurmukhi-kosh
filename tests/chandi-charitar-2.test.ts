import { describe, it, expect } from "vitest";
import {
  cleanText,
  toLines,
  PAGE_OFFSET,
  CHANDI_2_SHABAD_BASE,
  type ExtractLine,
} from "../pipeline/chandi-charitar-2/lines";

// Lines as pipeline/chandi-charitar-2/extract.py writes them (pages are PDF pages).
const text = (page: number, gurmukhi: string): ExtractLine => ({ page, role: "text", gurmukhi });
const label = (page: number, gurmukhi: string): ExtractLine => ({ page, role: "label", gurmukhi });

describe("cleanText", () => {
  it("closes a verse's numbers in double dandas, chapter and running count alike", () => {
    expect(cleanText("ਸੁ ਦੇਵ ਰਾਜ ਜੀਤਯੰ। ਤ੍ਰਿਲੋਕ ਰਾਜ ਕੀਤਯੰ। 1।")).toBe("ਸੁ ਦੇਵ ਰਾਜ ਜੀਤਯੰ। ਤ੍ਰਿਲੋਕ ਰਾਜ ਕੀਤਯੰ॥1॥");
    expect(cleanText("ਭਈ ਬਧਾਈ। ਸਭ ਸੁਖਦਾਈ। 1। 39।")).toBe("ਭਈ ਬਧਾਈ। ਸਭ ਸੁਖਦਾਈ॥1॥39॥");
  });

  it("reads a last number printed without its danda (p. 27: ਭਗਵੰਤ। 6।262)", () => {
    expect(cleanText("ਪਾਵਹਿਗੇ ਭਗਵੰਤ। 6।262")).toBe("ਪਾਵਹਿਗੇ ਭਗਵੰਤ॥6॥262॥");
  });

  it("drops the footnote marks set in the verse and label fonts (p. 148 ਰਸਾਵਲ¹, p. 151 ਸਸਤ੍ਰੁ¹)", () => {
    expect(cleanText("ਰਸਾਵਲ1 ਛੰਦ")).toBe("ਰਸਾਵਲ ਛੰਦ");
    expect(cleanText("ਸਰਬ ਸਸਤ੍ਰੁ1 ਆਵਤ ਭੇ ਜਿਤੇ।")).toBe("ਸਰਬ ਸਸਤ੍ਰੁ ਆਵਤ ਭੇ ਜਿਤੇ।");
  });

  it("drops the spacing mark typed '&' inside a word (p. 133 ਉ‐ਠੇ, p. 136 ਮੰ‐ਡੇ, ਉ‐ਚੰ)", () => {
    expect(cleanText("ਬਾਹੈ ਨਿਸੰਗ। ਉ==ਠੇ ਝੜੰਗ।")).toBe("ਬਾਹੈ ਨਿਸੰਗ। ਉਠੇ ਝੜੰਗ।");
    expect(cleanText("ਮੰ=ਡੇ ਮਧ ਜੰਗੰ।")).toBe("ਮੰਡੇ ਮਧ ਜੰਗੰ।");
  });

  it("drops a stray dot (p. 139 ਅਭੂਤੰ .ਭਯਾਣੰ) and keeps one of a vowel sign typed twice (p. 148 ਜਾਰੇੇ)", () => {
    expect(cleanText("ਅਭੂਤੰ .ਭਯਾਣੰ। 7। 84।")).toBe("ਅਭੂਤੰ ਭਯਾਣੰ॥7॥84॥");
    expect(cleanText("ਜਵਾ ਜੇਮਿ ਜਾਰੇੇ।")).toBe("ਜਵਾ ਜੇਮਿ ਜਾਰੇ।");
  });

  it("closes up spaces", () => {
    expect(cleanText("ਧੁਨੰ ਨਿਰਬਿਖਾਦੰ।  ਸੁਨੋ ਦਈਤ ਰਾਜੰ।")).toBe("ਧੁਨੰ ਨਿਰਬਿਖਾਦੰ। ਸੁਨੋ ਦਈਤ ਰਾਜੰ।");
  });
});

describe("toLines", () => {
  const opening = [
    label(1, "ਸ੍ਰੀ ਭਗਉਤੀ ਜੀ ਸਹਾਇ।"),
    label(1, "ਅਥ ਚੰਡੀ ਚਰਿਤ੍ਰ ਲਿਖ੍ਯਤੇ।"),
    label(1, "ਨਰਾਜ ਛੰਦ"),
    text(1, "ਮਹਿਖ ਦਈਤ ਸੂਰਯੰ। ਬਢਿਯੋ ਸੋ ਲੋਹ ਪੂਰਯੰ।"),
    text(1, "ਸੁ ਦੇਵ ਰਾਜ ਜੀਤਯੰ। ਤ੍ਰਿਲੋਕ ਰਾਜ ਕੀਤਯੰ। 1।"),
  ];

  it("gives each half-line its own row, closing in ॥ or its verse numbers, on the printed page", () => {
    const lines = toLines(opening);
    expect(lines.map((l) => l.gurmukhi)).toEqual([
      "ਸ੍ਰੀ ਭਗਉਤੀ ਜੀ ਸਹਾਇ ॥",
      "ਅਥ ਚੰਡੀ ਚਰਿਤ੍ਰ ਲਿਖ੍ਯਤੇ ॥",
      "ਨਰਾਜ ਛੰਦ ॥",
      "ਮਹਿਖ ਦਈਤ ਸੂਰਯੰ ॥",
      "ਬਢਿਯੋ ਸੋ ਲੋਹ ਪੂਰਯੰ ॥",
      "ਸੁ ਦੇਵ ਰਾਜ ਜੀਤਯੰ ॥",
      "ਤ੍ਰਿਲੋਕ ਰਾਜ ਕੀਤਯੰ ॥੧॥",
    ]);
    expect(lines.map((l) => l.line_no)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(lines.every((l) => l.verse_id === l.line_no)).toBe(true);
    expect(lines[0].ang).toBe(1 + PAGE_OFFSET);
    expect(PAGE_OFFSET).toBe(130);
  });

  it("joins a colophon printed on two lines, ends the chapter with it and opens the next", () => {
    const lines = toLines([
      ...opening,
      label(5, "ਇਤਿ ਸ੍ਰੀ ਬਚਿਤ੍ਰ ਨਾਟਕੇ ਚੰਡੀ ਚਰਿਤ੍ਰੇ ਮਹਿਖਾਸੁਰ ਬਧਹ"),
      label(5, "ਪ੍ਰਥਮ ਧਿਆਇ ਸੰਪੂਰਨੰਮ ਸਤੁ ਸੁਭਮ ਸਤੁ। 1।"),
      text(5, "ਅਥ ਧੂਮਨੈਨ ਜੁਧ ਕਥਨ"),
      label(5, "ਕੁਲਕ ਛੰਦ"),
      text(5, "ਦੇਵ ਸੁ ਤਬ ਗਾਜੀਯ। ਅਨਹਦ ਬਾਜੀਯ।"),
      text(5, "ਭਈ ਬਧਾਈ। ਸਭ ਸੁਖਦਾਈ। 1। 39।"),
    ]);
    const rest = lines.slice(7);
    expect(rest.map((l) => [l.gurmukhi, l.chapter])).toEqual([
      ["ਇਤਿ ਸ੍ਰੀ ਬਚਿਤ੍ਰ ਨਾਟਕੇ ਚੰਡੀ ਚਰਿਤ੍ਰੇ ਮਹਿਖਾਸੁਰ ਬਧਹ ਪ੍ਰਥਮ ਧਿਆਇ ਸੰਪੂਰਨੰਮ ਸਤੁ ਸੁਭਮ ਸਤੁ ॥੧॥", 1],
      ["ਅਥ ਧੂਮਨੈਨ ਜੁਧ ਕਥਨ ॥", 2],
      ["ਕੁਲਕ ਛੰਦ ॥", 2],
      ["ਦੇਵ ਸੁ ਤਬ ਗਾਜੀਯ ॥", 2],
      ["ਅਨਹਦ ਬਾਜੀਯ ॥", 2],
      ["ਭਈ ਬਧਾਈ ॥", 2],
      ["ਸਭ ਸੁਖਦਾਈ ॥੧॥੩੯॥", 2],
    ]);
    // the colophon stays in chapter 1's shabad; chapter 2 opens a new one
    expect(rest[0].shabad_id).toBe(lines[6].shabad_id);
    expect(rest[1].shabad_id).toBe(rest[0].shabad_id + 1);
  });

  it("starts a shabad at each run of a new chhand, from the base up", () => {
    const lines = toLines([
      ...opening,
      label(1, "ਰਸਾਵਲ ਛੰਦ"),
      text(1, "ਤਬੈ ਦੇਵ ਧਾਏ। ਸਭੋ ਸੀਸ ਨਿਆਏ। ਸੁਮਨ ਧਾਰ ਬਰਖੇ। ਸਬੈ ਸਾਧ ਹਰਖੇ। 6।"),
      label(10, "ਰਸਾਲਵ ਛੰਦ"),
      text(10, "ਤਬੈ ਦੇਵ ਧਾਏ। ਸਭੋ ਸੀਸ ਨਿਆਏ। 7।"),
    ]);
    expect(lines[0].shabad_id).toBe(CHANDI_2_SHABAD_BASE + 1);
    const byLabel = (g: string) => lines.find((l) => l.gurmukhi === g)!.shabad_id;
    expect(byLabel("ਰਸਾਵਲ ਛੰਦ ॥")).toBe(CHANDI_2_SHABAD_BASE + 2);
    // ਰਸਾਲਵ is this print's slip for ਰਸਾਵਲ: the same run, so no new shabad
    expect(byLabel("ਰਸਾਲਵ ਛੰਦ ॥")).toBe(CHANDI_2_SHABAD_BASE + 2);
  });
});
