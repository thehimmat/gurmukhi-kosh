import { describe, it, expect } from "vitest";
import { splitPagedPadas, cleanText, toLines, refDigits, dropPageNumbers } from "../pipeline/sarbloh/lines";

describe("splitPagedPadas", () => {
  const pages = [
    "੧\n< ਸ੍ਰੀ ਵਾਹਿਗੁਰੂ ਜੀ ਕੀ ਫਤਿਹ ॥\nਸ੍ਰੀ ਮੁਖਿਵਾਕ੍ਯ ਪਾਤਿਸਾਹੀ ੧੦ ॥ ਮਾਯਾ ਕੋ ਬਪੁ ਧਾਰਿ",
    "੨\nਜਗਤ ਮਹਿ ਅਲਖ ਲਖਾਨੀ ॥ ੧ ॥ ਤੀਨ ਲੋਕ ॥\n",
    "੩\n॥ ੨ ॥ ਦੁਖ ਜਾਂਹਿ ॥ ੩ ॥ ੧੦੩ ॥",
  ];
  const p = splitPagedPadas(pages);

  it("drops the printed page number at the top of each page", () => {
    expect(p.map((x) => x.text)).toEqual([
      "< ਸ੍ਰੀ ਵਾਹਿਗੁਰੂ ਜੀ ਕੀ ਫਤਿਹ",
      "ਸ੍ਰੀ ਮੁਖਿਵਾਕ੍ਯ ਪਾਤਿਸਾਹੀ ੧੦",
      "ਮਾਯਾ ਕੋ ਬਪੁ ਧਾਰਿ ਜਗਤ ਮਹਿ ਅਲਖ ਲਖਾਨੀ",
      "ਤੀਨ ਲੋਕ",
      "ਦੁਖ ਜਾਂਹਿ",
    ]);
  });

  it("gives each half-line the printed page it starts on, and the page numbers it runs onto", () => {
    expect(p.map((x) => x.page)).toEqual([1, 1, 1, 2, 3]);
    expect(p[2].breaks).toEqual([2]);
    expect(p[0].breaks).toEqual([]);
  });

  it("keeps verse numbers, including one that follows a page break, and double numbers", () => {
    expect(p.map((x) => x.ref)).toEqual([null, null, "1", "2", "3.103"]);
  });
});

describe("cleanText", () => {
  it("reads the legacy-font '<' as ੴ", () => {
    expect(cleanText("< ਸ੍ਰੀ ਵਾਹਿਗੁਰੂ ਜੀ ਕੀ ਫਤਿਹ").text).toBe("ੴ ਸ੍ਰੀ ਵਾਹਿਗੁਰੂ ਜੀ ਕੀ ਫਤਿਹ");
  });

  it("reads stray symbols that stand for dandas as ॥", () => {
    expect(cleanText("ਗਨ ਗੁਨ ਕੋਟਕ ñ ਅਕਲ ਕਲਾ").text).toBe("ਗਨ ਗੁਨ ਕੋਟਕ ॥ ਅਕਲ ਕਲਾ");
    expect(cleanText("ਘੱਟ ਬਜਾਯ ਕੈ !! ਦਲ ਨਿਰਖ").text).toBe("ਘੱਟ ਬਜਾਯ ਕੈ ॥ ਦਲ ਨਿਰਖ");
    expect(cleanText("ਖੰਡ ਦੁਧਾਰਾ #੧੬੨").text).toBe("ਖੰਡ ਦੁਧਾਰਾ ॥੧੬੨");
  });

  it("reads a colon after a letter as visarga, and a free-standing one as a danda", () => {
    expect(cleanText("ਸ਼੍ਰੀ ਭਗਉਤੀਏ ਨਮ:").text).toBe("ਸ਼੍ਰੀ ਭਗਉਤੀਏ ਨਮਃ");
    expect(cleanText("ਕੀ ਮਾਰਾ : ਰਾਗ ਕਉਭਾਰਾ").text).toBe("ਕੀ ਮਾਰਾ ॥ ਰਾਗ ਕਉਭਾਰਾ");
  });

  it("drops other non-Gurmukhi characters and reports them", () => {
    const r = cleanText("ਜ਼ੇਬਾ ਅਤਲਸ ਕਲİਤ ਅੰਬਰ");
    expect(r.text).toBe("ਜ਼ੇਬਾ ਅਤਲਸ ਕਲਤ ਅੰਬਰ");
    expect(r.dropped).toEqual(["İ"]);
  });
});

describe("refDigits", () => {
  it("writes verse numbers Dasam-style in Gurmukhi digits", () => {
    expect(refDigits("105")).toBe("॥੧੦੫॥");
    expect(refDigits("366.1120")).toBe("॥੩੬੬॥੧੧੨੦॥");
  });
});

describe("dropPageNumbers", () => {
  it("removes page numbers the canonical text still carries, wherever they sit, keeping real numbers", () => {
    expect(dropPageNumbers("੧ ੴ ਸ੍ਰੀ ਵਾਹਿਗੁਰੂ", "ੴ ਸ੍ਰੀ ਵਾਹਿਗੁਰੂ")).toBe("ੴ ਸ੍ਰੀ ਵਾਹਿਗੁਰੂ");
    expect(dropPageNumbers("ਮਾਯਾ ਕੋ ਬਪੁ ਧਾਰਿ ੨ ਜਗਤ ਮਹਿ", "ਮਾਯਾ ਕੋ ਬਪੁ ਧਾਰਿ ਜਗਤ ਮਹਿ")).toBe("ਮਾਯਾ ਕੋ ਬਪੁ ਧਾਰਿ ਜਗਤ ਮਹਿ");
    expect(dropPageNumbers("ਪਾਤਿਸਾਹੀ ੧੦ ੧੧ ਛੰਦ", "ਪਾਤਿਸਾਹੀ ੧੦ ਛੰਦ")).toBe("ਪਾਤਿਸਾਹੀ ੧੦ ਛੰਦ");
  });
});

describe("toLines", () => {
  it("writes each half-line with its page and verse number", () => {
    const [l] = toLines([{ text: "ਮਾਯਾ ਕੋ ਬਪੁ ਧਾਰਿ ਜਗਤ ਮਹਿ ਅਲਖ ਲਖਾਨੀ", ref: "1", page: 1, breaks: [2] }]);
    expect(l).toMatchObject({ gurmukhi: "ਮਾਯਾ ਕੋ ਬਪੁ ਧਾਰਿ ਜਗਤ ਮਹਿ ਅਲਖ ਲਖਾਨੀ ॥੧॥", ang: 1 });
  });


  it("splits a half-line where a stray symbol stood for a danda, keeping the verse number on the last part", () => {
    const ls = toLines([{ text: "ਗਨ ਗੁਨ ਕੋਟਕ ñ ਅਕਲ ਕਲਾ ਜਗ", ref: "7", page: 4, breaks: [] }]);
    expect(ls.map((l) => l.gurmukhi)).toEqual(["ਗਨ ਗੁਨ ਕੋਟਕ ॥", "ਅਕਲ ਕਲਾ ਜਗ ॥੭॥"]);
    expect(ls.map((l) => l.ang)).toEqual([4, 4]);
  });

  it("reads ਲਲ / ਿਲ next to a number as the ॥ the typist entered as 'll'", () => {
    expect(toLines([{ text: "ਖੰਜਰ ਧੋਪ ਕਟਾਰ ਖੁਰੀ ਲਲ ੫੯", ref: "17", page: 69, breaks: [] }])[0].gurmukhi).toBe("ਖੰਜਰ ਧੋਪ ਕਟਾਰ ਖੁਰੀ ॥੫੯॥੧੭॥");
  });

  it("moves a number left at the end of a half-line into its verse number (a missing danda)", () => {
    expect(toLines([{ text: "ਕਾਇਰ ਬੀਰ ਸਭੈ ਕਟਿ ਜਾਵਤ ੯", ref: "576", page: 77, breaks: [] }])[0].gurmukhi).toBe("ਕਾਇਰ ਬੀਰ ਸਭੈ ਕਟਿ ਜਾਵਤ ॥੯॥੫੭੬॥");
    expect(toLines([{ text: "ਪ੍ਰਿਥਮ ਕਾਂਡ ਸਮਾਪਤਿ ਸੁਭਮੱਸਤੁ ੧", ref: null, page: 851, breaks: [] }])[0].gurmukhi).toBe("ਪ੍ਰਿਥਮ ਕਾਂਡ ਸਮਾਪਤਿ ਸੁਭਮੱਸਤੁ ॥੧॥");
  });

  it("moves a number at the start of a half-line to the end of the one before (a missing danda)", () => {
    const ls = toLines([
      { text: "ਬਹੁ ਬਾਨਨ ਕੀ ਬਰਖਾ", ref: "14", page: 50, breaks: [] },
      { text: "੩੮੫ ਬਰ ਜੁੱਧ ਮੰਡਯੋ", ref: null, page: 50, breaks: [] },
    ]);
    expect(ls.map((l) => l.gurmukhi)).toEqual(["ਬਹੁ ਬਾਨਨ ਕੀ ਬਰਖਾ ॥੧੪॥੩੮੫॥", "ਬਰ ਜੁੱਧ ਮੰਡਯੋ ॥"]);
  });

  it("keeps a number that is part of the text (ਪਾਤਿਸਾਹੀ ੧੦ is not at the end once its verse number follows)", () => {
    expect(toLines([{ text: "ਸ੍ਰੀ ਮੁਖਿਵਾਕ੍ਯ ਪਾਤਿਸਾਹੀ ੧੦", ref: null, page: 1, breaks: [] }])[0].gurmukhi).toBe("ਸ੍ਰੀ ਮੁਖਿਵਾਕ੍ਯ ਪਾਤਿਸਾਹੀ ੧੦ ॥");
  });

  it("turns a number that followed a stray danda symbol into the verse number", () => {
    expect(toLines([{ text: "ਖੰਡ ਦੁਧਾਰਾ #੧੬੨", ref: null, page: 9, breaks: [] }])[0].gurmukhi).toBe("ਖੰਡ ਦੁਧਾਰਾ ॥੧੬੨॥");
  });
});
