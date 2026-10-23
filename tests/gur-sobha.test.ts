import { describe, it, expect } from "vitest";
import {
  cleanText,
  splitTuks,
  toLines,
  wordText,
  PAGE_OFFSET,
  GUR_SOBHA_SHABAD_BASE,
  type ExtractLine,
} from "../pipeline/gur-sobha/lines";

// Lines as pipeline/gur-sobha/extract.py writes them from the ISS 2014 edition (pages are PDF pages).
const line = (page: number, gurmukhi: string, extra: Partial<ExtractLine> = {}): ExtractLine => ({
  page,
  notes: false,
  bold: false,
  gurmukhi,
  ...extra,
});

describe("cleanText", () => {
  it("reads '||' typed for ']]' (ਫ਼ਫ਼) as the double danda", () => {
    expect(cleanText("ਚਹੁ ਦਿਸ ਭਯੋ ਅਨੰਦਫ਼ਫ਼4ਫ਼ਫ਼547ਫ਼ਫ਼")).toBe("ਚਹੁ ਦਿਸ ਭਯੋ ਅਨੰਦ॥4॥547॥");
  });

  it("reads a danda typed before a verse number as the double danda", () => {
    // '.' typed for ']': ਕਾਮ। 21॥317॥ prints ਕਾਮ॥21॥317॥
    expect(cleanText("ਏ ਰਾਜਨ ਕੇ ਕਾਮ। 21॥317॥")).toBe("ਏ ਰਾਜਨ ਕੇ ਕਾਮ॥21॥317॥");
    expect(cleanText("ਕਬਿ ਕੀ ਗਤਿ ਜੋਈ।2॥261॥")).toBe("ਕਬਿ ਕੀ ਗਤਿ ਜੋਈ॥2॥261॥");
  });

  it("keeps one of a vowel sign typed twice", () => {
    expect(cleanText("ਮਾਰੇੇ। ਸੋੋਈ ਦੇਹੁੁ")).toBe("ਮਾਰੇ। ਸੋਈ ਦੇਹੁ");
  });

  it("reads ੈ stacked with ੇ as ੈ, as printed (p. 64 ਕਰੈ, p. 350 ਲੈ)", () => {
    expect(cleanText("ਕਰੈੇ ਬੈਨ")).toBe("ਕਰੈ ਬੈਨ");
    expect(cleanText("ਫਉਜ ਲੇੈ ਕੇ")).toBe("ਫਉਜ ਲੈ ਕੇ");
  });

  it("reads a kanaura after another vowel sign as the closing quote it was typed for", () => {
    // romanised in the edition as lîjiyai’’, sri’, parsâdi’’
    expect(cleanText("ਕਰਿ ਲੀਜਿਯੈੌ?")).toBe("ਕਰਿ ਲੀਜਿਯੈ”?");
    expect(cleanText("ਰਛਯਾ ਸ੍ਰੀੌ ਕਾਲ")).toBe("ਰਛਯਾ ਸ੍ਰੀ” ਕਾਲ");
    expect(cleanText("ਬੇਗ ਪ੍ਰਸਾਦਿੌੌ ਐਸੇ")).toBe("ਬੇਗ ਪ੍ਰਸਾਦਿ” ਐਸੇ");
    expect(cleanText("ਤੁਮ ਹੀ ਬਰਨੌ,")).toBe("ਤੁਮ ਹੀ ਬਰਨੌ,"); // a real kanaura stays
  });

  it("drops a sihari stranded before kanna (p. 398 ਮਿਲਾਇ)", () => {
    expect(cleanText("ਪਸੁਨ ਮਿਲਿਾਇ ਲਿਯੋ।")).toBe("ਪਸੁਨ ਮਿਲਾਇ ਲਿਯੋ।");
  });

  it("puts addak after aunkar, as Unicode orders them", () => {
    expect(cleanText("ਜੱੁਧ")).toBe("ਜੁੱਧ");
  });
});

describe("splitTuks", () => {
  it("ends each tuk in ॥ or its verse numbers, in Gurmukhi digits", () => {
    expect(splitTuks("ਪ੍ਰਭੁ ਰਚਨਾ ਐਸੇ ਰਚੀ, ਸੋ ਤੁਮ ਕਹੋ ਸੁਨਾਇ॥1॥")).toEqual(["ਪ੍ਰਭੁ ਰਚਨਾ ਐਸੇ ਰਚੀ, ਸੋ ਤੁਮ ਕਹੋ ਸੁਨਾਇ ॥੧॥"]);
    expect(splitTuks("ਬਰਨਿ ਬਰਨਿ ਕਥਿ ਕਥਿ ਰਹਤ, ਕੋਉ ਨ ਪਾਵਤ ਪਾਰ॥ 2॥43॥")).toEqual([
      "ਬਰਨਿ ਬਰਨਿ ਕਥਿ ਕਥਿ ਰਹਤ, ਕੋਉ ਨ ਪਾਵਤ ਪਾਰ ॥੨॥੪੩॥",
    ]);
  });

  it("splits a printed line at its danda", () => {
    expect(splitTuks("ਤਵ ਪ੍ਰਸਾਦਿ ਗੁਰੂ ਉਪਦੇਸੇ। ਜਨਮ ਜਨਮ ਕੇ ਮਿਟੇ ਅੰਦੇਸੇ।")).toEqual([
      "ਤਵ ਪ੍ਰਸਾਦਿ ਗੁਰੂ ਉਪਦੇਸੇ ॥",
      "ਜਨਮ ਜਨਮ ਕੇ ਮਿਟੇ ਅੰਦੇਸੇ ॥",
    ]);
    expect(splitTuks("ਕ੍ਰਿਸਾਨ ਖੇਤ ਕਾਟਈ।ਕਰੀ ਸੁ ਤਾਹਿ ਬਾਟਈ")).toEqual(["ਕ੍ਰਿਸਾਨ ਖੇਤ ਕਾਟਈ ॥", "ਕਰੀ ਸੁ ਤਾਹਿ ਬਾਟਈ ॥"]);
  });

  it("keeps the edition's commas and quotes inside a tuk, but not a comma closing it", () => {
    expect(splitTuks("ਤੁਹੀ ਗੁਰੂ ਨਾਨਕ ਹੈਂ ਤੁਹੀ ਗੁਰੂ ਅੰਗਦ ਹੈਂ,")).toEqual(["ਤੁਹੀ ਗੁਰੂ ਨਾਨਕ ਹੈਂ ਤੁਹੀ ਗੁਰੂ ਅੰਗਦ ਹੈਂ ॥"]);
    expect(splitTuks("ਕਹਯੋ,“ਹਮ ਸੇਵਕ ਤੇਰੇ।”")).toEqual(["ਕਹਯੋ,“ਹਮ ਸੇਵਕ ਤੇਰੇ ॥”"]);
  });
});

describe("toLines", () => {
  const page = 46;
  const opening = [
    line(page, "ੴ ਸ੍ਰੀ ਵਾਹਗੁਰੂ ਜੀ ਕੀ ਫਤਹਿ।", { bold: true }),
    line(page, "ਸ੍ਰੀ ਗੁਰੁ ਸੋਭਾ ਗ੍ਰੰਥ ਲਿਖਯਤੇ", { bold: true }),
    line(page, "ਅਥ ਪ੍ਰਿਥਮ ਧਿਆਉ ਪੰਥ ਪ੍ਰਕਾਸ ਕਥਨੰ।"),
    line(page, "ਦੋਹਰਾ: ਏਕ ਸਮੈ ਹਿਤ ਸੋ ਹਿਤੂ, ਉਚਰੀ ਹਿਤ ਚਿਤ ਲਾਇ।"),
    line(page, "ਪ੍ਰਭੁ ਰਚਨਾ ਐਸੇ ਰਚੀ, ਸੋ ਤੁਮ ਕਹੋ ਸੁਨਾਇ॥1॥"),
    line(page, "ਸਵੈਯਾ: ਸੁਨਿਕੈ ਉਪਜੀ ਤਬ ਹੀ ਮਨਿ ਮੈ, ਬਰਨੋ ਉਪਮਾ ਪ੍ਰਭੁ ਕੀ ਕਹੀਐ।"),
    line(page, "ਤੁਮਰੀ ਉਪਮਾ ਤੁਮ ਹੀ ਬਰਨੌ, ਕਰ ਆਪਨ ਤੇ ਕਹਿ ਮੋ ਗਹੀਐ॥2॥"),
    line(58, "ਇਤਿ ਸ੍ਰੀ ਗੁਰੁ ਸੋਭਾ ਗ੍ਰੰਥ ਪੰਥ ਪ੍ਰਗਾਸ ਉਸਤਤਿ ਪ੍ਰਿਥਮ ਧਿਆਇ ਸੰਪੂਰਨਮਸਤੁ ਸੁਭਮਸਤੁ॥1॥"),
    line(60, "ਜਿਤੇ ਰਾਮ ਹੂਏ ਸਭੈ ਅੰਤਿ ਮੂਏ ।", { notes: true }),
    line(62, "ਦੂਸਰਾ ਅਧਿਆਇ", { bold: true }),
    line(62, "(ਭੰਗਾਣੀ ਦਾ ਜੁਧ)", { bold: true }),
    line(62, "ਦੋਹਰਾ: ਜੋ ਚਲਿਤ੍ਰ ਪ੍ਰਭ ਪੁਰਖ ਕੇ, ਤਾ ਕੋ ਕਰਤ ਬਿਚਾਰ।"),
    line(62, "ਜਥਾ ਸਕਤਿ ਉਪਮਾ ਕਹਤ, ਮਨ ਅੰਤਰਿ ਉਰਿਧਾਰਿ॥1॥42॥"),
    line(80, "ਇਤਿ ਸ੍ਰੀ ਗੁਰ ਸੋਭਾ ਗ੍ਰੰਥ ਤੇਗ ਪ੍ਰਗਾਸ ਸਾਹ ਸੰਗ੍ਰਾਮ ਜੁਧ ਬਰਨਨੰ ਨਾਮ ਅਧਿਆਇ ਦੂਸਰਾ"),
    line(80, "ਸੰਪੂਰਨਮਸਤੁ ਸੁਭਮਸਤੁ॥2॥"),
    line(421, "ਨੋਟਸ ਦੀ ਸਤਰ"),
  ];
  const lines = toLines(opening, 2);
  const texts = lines.map((l) => l.gurmukhi);

  it("keeps the opening rubric but none of the edition's own bold headings, notes or back matter", () => {
    expect(texts[0]).toBe("ੴ ਸ੍ਰੀ ਵਾਹਗੁਰੂ ਜੀ ਕੀ ਫਤਹਿ ॥");
    expect(texts[1]).toBe("ਸ੍ਰੀ ਗੁਰੁ ਸੋਭਾ ਗ੍ਰੰਥ ਲਿਖਯਤੇ ॥");
    expect(texts.join(" ")).not.toMatch(/ਦੂਸਰਾ ਅਧਿਆਇ ॥|ਭੰਗਾਣੀ|ਜਿਤੇ ਰਾਮ|ਨੋਟਸ/);
  });

  it("gives a chhand label its own row", () => {
    expect(texts.slice(3, 6)).toEqual([
      "ਦੋਹਰਾ ॥",
      "ਏਕ ਸਮੈ ਹਿਤ ਸੋ ਹਿਤੂ, ਉਚਰੀ ਹਿਤ ਚਿਤ ਲਾਇ ॥",
      "ਪ੍ਰਭੁ ਰਚਨਾ ਐਸੇ ਰਚੀ, ਸੋ ਤੁਮ ਕਹੋ ਸੁਨਾਇ ॥੧॥",
    ]);
  });

  it("joins a colophon run onto a second line", () => {
    expect(texts).toContain("ਇਤਿ ਸ੍ਰੀ ਗੁਰ ਸੋਭਾ ਗ੍ਰੰਥ ਤੇਗ ਪ੍ਰਗਾਸ ਸਾਹ ਸੰਗ੍ਰਾਮ ਜੁਧ ਬਰਨਨੰ ਨਾਮ ਅਧਿਆਇ ਦੂਸਰਾ ਸੰਪੂਰਨਮਸਤੁ ਸੁਭਮਸਤੁ ॥੨॥");
  });

  it("numbers chapters by their colophons and stops after the last", () => {
    expect(lines.at(-1)!.chapter).toBe(2);
    expect(lines[0].chapter).toBe(1);
    expect(lines.find((l) => l.gurmukhi.startsWith("ਜੋ ਚਲਿਤ੍ਰ"))!.chapter).toBe(2);
  });

  it("uses the printed page as ang", () => {
    expect(lines[0].ang).toBe(46 - PAGE_OFFSET);
    expect(lines.at(-1)!.ang).toBe(80 - PAGE_OFFSET);
  });

  it("starts a shabad at each chapter and at a change of chhand", () => {
    const shabad = (start: string) => lines.find((l) => l.gurmukhi.startsWith(start))!.shabad_id;
    expect(lines[0].shabad_id).toBe(GUR_SOBHA_SHABAD_BASE + 1);
    expect(shabad("ਸਵੈਯਾ")).toBeGreaterThan(shabad("ਦੋਹਰਾ"));
    expect(shabad("ਜੋ ਚਲਿਤ੍ਰ")).toBeGreaterThan(shabad("ਇਤਿ ਸ੍ਰੀ ਗੁਰੁ"));
  });

  it("numbers verse_id and line_no from 1 in reading order", () => {
    expect(lines.map((l) => l.verse_id)).toEqual(lines.map((_, k) => k + 1));
    expect(lines.map((l) => l.line_no)).toEqual(lines.map((_, k) => k + 1));
  });
});

describe("wordText", () => {
  it("counts words without the edition's punctuation", () => {
    expect(wordText("ਕਹਯੋ,“ਹਮ ਸੇਵਕ ਤੇਰੇ ॥”")).toBe("ਕਹਯੋ ਹਮ ਸੇਵਕ ਤੇਰੇ ॥");
  });
});
