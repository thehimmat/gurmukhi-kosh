import { describe, it, expect } from "vitest";
import {
  cleanText,
  pauriNumber,
  toLines,
  GURDAS_SINGH_SHABAD_BASE,
  type ExtractLine,
} from "../pipeline/gurdas-singh-vaar/lines";

// Lines as pipeline/gurdas-singh-vaar/extract.py writes them (pages are PDF pages).
const line = (page: number, gurmukhi: string): ExtractLine => ({ page, gurmukhi });

describe("cleanText", () => {
  it("closes up the pauri number as the other corpora write it", () => {
    expect(cleanText("ਵਾਹ ਵਾਹ ਗੋਬਿੰਦ ਸਿੰਘ ਆਪੇ ਗੁਰੁ ਚੇਲਾ ॥ ੧ ॥")).toBe("ਵਾਹ ਵਾਹ ਗੋਬਿੰਦ ਸਿੰਘ ਆਪੇ ਗੁਰੁ ਚੇਲਾ ॥੧॥");
    expect(cleanText("ਹੇ ਸਤਿਗੁਰੁ ਮੁਹਿ ਲੇਹੁ ਉਬਾਰਾ ॥ ੨੮ ॥")).toBe("ਹੇ ਸਤਿਗੁਰੁ ਮੁਹਿ ਲੇਹੁ ਉਬਾਰਾ ॥੨੮॥");
  });

  it("collapses runs of spaces", () => {
    expect(cleanText("  ਹਰਿ  ਸਚੇ ਤਖਤ ॥ ")).toBe("ਹਰਿ ਸਚੇ ਤਖਤ ॥");
  });

  it("keeps the typed text's misprints as printed", () => {
    // ੲੈ for ਐ (p. 4) and a bindi on ਨ for the tippi (p. 4): checked against the page images
    expect(cleanText("ਰਿਖੀਜੇਸ ਰਘੁਨਾਥ ਰਾਇ ਜਪੀੲੈ ਬਨਵਾਰੀ ॥")).toBe("ਰਿਖੀਜੇਸ ਰਘੁਨਾਥ ਰਾਇ ਜਪੀੲੈ ਬਨਵਾਰੀ ॥");
    expect(cleanText("ਅਨਂਦ ਬਿਨੋਦੀ ਚੋਜੀਆ ਸਚੁ ਸਚੀ ਵੇਲਾ ॥")).toBe("ਅਨਂਦ ਬਿਨੋਦੀ ਚੋਜੀਆ ਸਚੁ ਸਚੀ ਵੇਲਾ ॥");
  });
});

describe("pauriNumber", () => {
  it("reads the number that closes a pauri", () => {
    expect(pauriNumber("ਵਾਹ ਵਾਹ ਗੋਬਿੰਦ ਸਿੰਘ ਆਪੇ ਗੁਰੁ ਚੇਲਾ ॥੧੪॥")).toBe(14);
  });

  it("is null for a line inside a pauri", () => {
    expect(pauriNumber("ਹਰਿ ਸਚੇ ਤਖਤ ਰਚਾਇਆ ਸਤਿ ਸੰਗਤਿ ਮੇਲਾ ॥")).toBeNull();
  });
});

describe("toLines", () => {
  const extract = [
    line(1, "ੴ ਸਤਿਗੁਰਪ੍ਰਸਾਦਿ ॥"),
    line(1, "ਹਰਿ ਸਚੇ ਤਖਤ ਰਚਾਇਆ ਸਤਿ ਸੰਗਤਿ ਮੇਲਾ ॥"),
    line(1, "ਵਾਹ ਵਾਹ ਗੋਬਿੰਦ ਸਿੰਘ ਆਪੇ ਗੁਰੁ ਚੇਲਾ ॥ ੧ ॥"),
    line(1, "ਸਚਾ ਅਮਰ ਗੋਬਿੰਦ ਕਾ ਸੁਣ ਗੁਰੂ ਪਿਆਰੇ ॥"),
    line(2, "ਵਾਹ ਵਾਹ ਗੋਬਿੰਦ ਸਿੰਘ ਆਪੇ ਗੁਰੁ ਚੇਲਾ ॥ ੨ ॥"),
    line(15, "ਹਰਿ ਸਤਿਗੁਰ ਨਾਨਕ ਖੇਲ ਰਚਾਇਆ ॥"),
    line(16, "ਹੇ ਸਤਿਗੁਰੁ ਮੁਹਿ ਲੇਹੁ ਉਬਾਰਾ ॥ ੩ ॥"),
  ];
  const lines = toLines(extract);

  it("makes one row per printed line, the opening rubric included", () => {
    expect(lines.map((l) => l.gurmukhi)).toEqual([
      "ੴ ਸਤਿਗੁਰਪ੍ਰਸਾਦਿ ॥",
      "ਹਰਿ ਸਚੇ ਤਖਤ ਰਚਾਇਆ ਸਤਿ ਸੰਗਤਿ ਮੇਲਾ ॥",
      "ਵਾਹ ਵਾਹ ਗੋਬਿੰਦ ਸਿੰਘ ਆਪੇ ਗੁਰੁ ਚੇਲਾ ॥੧॥",
      "ਸਚਾ ਅਮਰ ਗੋਬਿੰਦ ਕਾ ਸੁਣ ਗੁਰੂ ਪਿਆਰੇ ॥",
      "ਵਾਹ ਵਾਹ ਗੋਬਿੰਦ ਸਿੰਘ ਆਪੇ ਗੁਰੁ ਚੇਲਾ ॥੨॥",
      "ਹਰਿ ਸਤਿਗੁਰ ਨਾਨਕ ਖੇਲ ਰਚਾਇਆ ॥",
      "ਹੇ ਸਤਿਗੁਰੁ ਮੁਹਿ ਲੇਹੁ ਉਬਾਰਾ ॥੩॥",
    ]);
  });

  it("gives each pauri a shabad, the rubric going with the first", () => {
    const b = GURDAS_SINGH_SHABAD_BASE;
    expect(lines.map((l) => l.shabad_id)).toEqual([b + 1, b + 1, b + 1, b + 2, b + 2, b + 3, b + 3]);
    expect(lines.map((l) => l.pauri)).toEqual([1, 1, 1, 2, 2, 3, 3]);
  });

  it("numbers rows through the work and keeps the PDF page as the ang", () => {
    expect(lines.map((l) => l.verse_id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(lines.map((l) => l.line_no)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(lines.map((l) => l.ang)).toEqual([1, 1, 1, 1, 2, 15, 16]);
  });

  it("uses a fresh shabad range above Gur Sobha's", () => {
    expect(GURDAS_SINGH_SHABAD_BASE).toBe(930000);
  });
});
