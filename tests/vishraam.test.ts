/**
 * Vishraam (pause) marks in the line viewer (#217): BaniDB's per-word marks
 * normalised for storage, and the letter each one colours.
 */
import { describe, it, expect } from "vitest";
import { normalizeVishraam, splitLastLetter, wordMarks, vishraamSets } from "../lib/vishraam";
import { lineParts } from "../lib/line-context";

describe("normalizeVishraam", () => {
  it("keeps each set's marks by word index", () => {
    expect(normalizeVishraam(
      { sttm: [{ p: 3, t: "v" }, { p: 0, t: "y" }], igurbani: [{ p: 3, t: "v" }], sttm2: [] },
      8,
    )).toEqual({ sttm: { 3: "v", 0: "y" }, igurbani: { 3: "v" } });
  });

  it("reads a word index BaniDB sends as a string", () => {
    expect(normalizeVishraam({ sttm: [{ p: "3", t: "v" }] }, 8)).toEqual({ sttm: { 3: "v" } });
  });

  it("drops unknown sets, unknown kinds and indexes past the line's last word", () => {
    expect(normalizeVishraam(
      { other: [{ p: 1, t: "v" }], sttm: [{ p: 1, t: "x" }, { p: 9, t: "v" }, { p: -1, t: "y" }] },
      4,
    )).toBeNull();
  });

  it("is null for a line with no marks, so the column stays empty", () => {
    expect(normalizeVishraam({ sttm: [], igurbani: [], sttm2: [] }, 4)).toBeNull();
    expect(normalizeVishraam(undefined, 4)).toBeNull();
  });
});

describe("splitLastLetter", () => {
  it("takes the last letter with its vowel signs", () => {
    expect(splitLastLetter("ਸਚੁ")).toEqual(["ਸ", "ਚੁ"]);
    expect(splitLastLetter("ਸੋਚਿ")).toEqual(["ਸੋ", "ਚਿ"]);
    expect(splitLastLetter("ਹੋਵਈ")).toEqual(["ਹੋਵ", "ਈ"]);
  });

  it("keeps tippi, bindi and addak on their letter", () => {
    expect(splitLastLetter("ਅੰਤੰ")).toEqual(["ਅੰ", "ਤੰ"]);
    expect(splitLastLetter("ਸਭਨਾਂ")).toEqual(["ਸਭ", "ਨਾਂ"]);
    expect(splitLastLetter("ਸੱਚ")).toEqual(["ਸੱ", "ਚ"]);
  });

  it("keeps a subjoined letter with the one it hangs from", () => {
    expect(splitLastLetter("ਤਿਨ੍ਹ")).toEqual(["ਤਿ", "ਨ੍ਹ"]);
    expect(splitLastLetter("ਪ੍ਰ")).toEqual(["", "ਪ੍ਰ"]);
  });

  it("gives a one-letter word whole", () => {
    expect(splitLastLetter("ਨ")).toEqual(["", "ਨ"]);
  });
});

describe("wordMarks", () => {
  it("gives each set's mark on a word, or nothing", () => {
    const v = { sttm: { 2: "v", 0: "y" }, igurbani: { 2: "v" } } as const;
    expect(wordMarks(v, 2)).toEqual({ sttm: "v", igurbani: "v" });
    expect(wordMarks(v, 0)).toEqual({ sttm: "y" });
    expect(wordMarks(v, 1)).toBeNull();
    expect(wordMarks(null, 1)).toBeNull();
  });
});

describe("vishraamSets", () => {
  it("lists the sets a passage has, iGurbani first", () => {
    expect(vishraamSets([{ sttm: { 1: "v" } }, null, { igurbani: { 0: "y" } }])).toEqual(["igurbani", "sttm"]);
    expect(vishraamSets([null, null])).toEqual([]);
  });
});

describe("lineParts word index", () => {
  it("numbers words by their place among the line's space-separated tokens, as BaniDB does", () => {
    const words = lineParts("॥ ਜਪੁ ॥").filter((p) => p.word);
    expect(words).toEqual([{ text: "ਜਪੁ", word: "ਜਪੁ", i: 1 }]);
    const w = lineParts("ਹੈ ਭੀ ਸਚੁ ਨਾਨਕ ਹੋਸੀ ਭੀ ਸਚੁ ॥੧॥").filter((p) => p.word);
    expect(w.map((p) => p.i)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe("VishraamPicker", () => {
  it("offers Off and each set the passage has, the server's default pressed", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const { VishraamPicker } = await import("../components/line/VishraamPicker");
    const html = renderToStaticMarkup(createElement(VishraamPicker, { sets: ["igurbani", "sttm"], initial: "igurbani" }));
    expect([...html.matchAll(/<button[^>]*aria-pressed="(\w+)"[^>]*>([^<]+)</g)].map((m) => `${m[2]}:${m[1]}`))
      .toEqual(["Off:false", "iGurbani:true", "SikhiToTheMax:false"]);
  });

  it("renders nothing for a passage without marks", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const { VishraamPicker } = await import("../components/line/VishraamPicker");
    expect(renderToStaticMarkup(createElement(VishraamPicker, { sets: [], initial: "off" }))).toBe("");
  });
});
