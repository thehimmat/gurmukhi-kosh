import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  sectionIndexes, toLines, SARBLOH_SHABAD_BASE,
  CHHANDS, CHHAND_LINES, LABEL_LINES, TRAILER_LINES, LABEL_ENDINGS, COLOPHON_WORDS, BISANPAD,
} from "../pipeline/sarbloh/lines";
import { PAGES_1_2, AYODHYA_KAND } from "./fixtures/sarbloh-sections";

/** The first line of each section, as [line_no, gurmukhi]. */
function heads(fixture: Array<[number, string]>) {
  const idx = sectionIndexes(fixture.map(([, gurmukhi]) => ({ gurmukhi })));
  return fixture.filter((_, k) => k === 0 || idx[k] !== idx[k - 1]).map(([no, g]) => [no, g]);
}

describe("sectionIndexes", () => {
  it("splits pages 1-2 (ਉਸਤਤਿ ਸ੍ਰੀ ਮਾਯਾ ਲਛਮੀ ਜੀ ਕੀ) where the print starts a new chhand", () => {
    expect(heads(PAGES_1_2)).toEqual([
      [1, "ੴ ਸ੍ਰੀ ਵਾਹਿਗੁਰੂ ਜੀ ਕੀ ਫਤਿਹ ॥"], // title block, then ਦੋਹਿਰਾ
      [9, "ਚੌਪਈ ॥"],
      [13, "ਦੋਹਿਰਾ ॥"],
      [18, "ਬਿਸਨੁਪਦ ਸਾਰੰਗ ਛਪਯ ॥"],
      [25, "ਦੋਹਿਰਾ ॥"],
      [46, "ਸੋਰਠਾ ॥"],
      [49, "ਬਿਸਨੁਪਦ ਸਾਰੰਗ ਛਪਯ ਛੰਦ ॥"],
    ]);
  });

  it("keeps a run of one chhand together, ends it at its colophon, and starts the next at its invocation", () => {
    // Each ਦੋਹਾ couplet repeats its header (some with a speaker); ਇਤੀ … closes Bal Kand; Ayodhya Kand
    // opens with ੴ / ਸਹਾਇ, its ਅਥ title and a ਚਉਪਈ run whose verses each repeat "ਪਈ".
    expect(heads(AYODHYA_KAND)).toEqual([
      [28661, "ਦੋਹਾ ॥"],
      [28685, "ੴ ਸ੍ਰੀ ਵਾਹਿਗੁਰੂ ਜੀ ਕੀ ਫ਼ਤਿਹ ॥"],
    ]);
  });

  it("starts a section where the verse count goes back to ੧ under no header", () => {
    const idx = sectionIndexes([
      { gurmukhi: "ਚੌਪਈ ॥" },
      { gurmukhi: "ਪਹਿਲੀ ਤੁਕ ॥" },
      { gurmukhi: "ਦੂਜੀ ਤੁਕ ॥੧॥" },
      { gurmukhi: "ਤੀਜੀ ਤੁਕ ॥" },
      { gurmukhi: "ਚਉਥੀ ਤੁਕ ॥੨॥੧੦॥" },
      { gurmukhi: "ਨਵੀਂ ਤੁਕ ॥" },
      { gurmukhi: "ਹੋਰ ਤੁਕ ॥੧॥੧੧॥" },
    ]);
    expect(idx).toEqual([0, 0, 0, 0, 0, 1, 1]);
  });

  it("keeps a short numbered label (ਦਸਕ ॥੧॥, ਅਸੁਕ ॥੧॥) with the verses it closes, not as a reset", () => {
    expect(sectionIndexes([
      { gurmukhi: "ਚੌਪਈ ॥" },
      { gurmukhi: "ਪਹਿਲੀ ਤੁਕ ਇਹ ਹੈ ॥" },
      { gurmukhi: "ਦੂਜੀ ਤੁਕ ਇਹ ਹੈ ॥੧੦॥" },
      { gurmukhi: "ਦਸਕ ॥੧॥" },
      { gurmukhi: "ਤੀਜੀ ਤੁਕ ਇਹ ਹੈ ॥" },
      { gurmukhi: "ਚਉਥੀ ਤੁਕ ਇਹ ਹੈ ॥੧੧॥" },
      { gurmukhi: "ਅਸੁਕ ॥੧॥" },
      { gurmukhi: "ਅਥ ਸਮਰੁ ਪਖਯਾਨ ਕਥਤੇ ॥" },
      { gurmukhi: "ਨਵੀਂ ਤੁਕ ਇਹ ਹੈ ॥੧॥" },
    ])).toEqual([0, 0, 0, 0, 0, 0, 0, 1, 1]);
  });

  it("reads a numbered ਬਿਸਨੁਪਦ heading (its part number, ਘਰ ॥੧॥) as the title of the section it opens", () => {
    // Budha Dal page 392, lines 11986-11994 (shabads 900592-900594 as first loaded).
    expect(sectionIndexes([
      { gurmukhi: "ਸੁ ਚਿੱਤ ਏਕ ਨਿਮਖੰ ਜਯੋ ਜਾਪ ਵਯਾਨੰ ॥" },
      { gurmukhi: "ਜਪੜੋ ਜਾਪ ਮੰਤ੍ਰ ਅਕਾਲੀ ਅਕਾਲੰ ॥੨॥੯॥੩੪੧॥੨੬੬੦॥" },
      { gurmukhi: "ਬਿਸਨੁਪਦ ਛੰਦ ਕਾਲੰਕਾ ਘਰ ॥੧॥" },
      { gurmukhi: "ਕਰਰੋ ਹੈ ਨਿਬੇਰੋ ਸੁਰਾ ਸੁਰ ਸੰਗ੍ਰਾਮੰ ॥" },
      { gurmukhi: "ਧਰਯੋ ਰੂਪ ਪਰਬਲ ਸਰਬਲੋਹ ਨਾਮੰ ॥" },
      { gurmukhi: "ਲੜਾ ਕਰ ਸੁਰਾ ਸੁਰ ਬਹੁਰ ਆਪ ਮਚਯੋ ॥" },
      { gurmukhi: "ਰਖਯੋ ਲਾਜ ਦੇਵਨ ਅਸੁਰ ਦੁਸ਼ ਅਚਯੋ ॥੧॥" },
      { gurmukhi: "ਸਾਨੀ ॥" },
      { gurmukhi: "ਪ੍ਰਿਥੀ ਭਾਰ ਮੇਟਰੋ ਕਰੀ ਦੇਵ ਰੱਛ ॥" },
    ])).toEqual([0, 0, 1, 1, 1, 1, 1, 1, 1]);
  });

  it("does not read a verse that opens with ਬਿਸਨੁ (Vishnu) as a ਬਿਸਨੁਪਦ title", () => {
    expect(sectionIndexes([
      { gurmukhi: "ਚੌਪਈ ॥" },
      { gurmukhi: "ਪਹਿਲੀ ਤੁਕ ਇਹ ਹੈ ॥" },
      { gurmukhi: "ਦੂਜੀ ਤੁਕ ਇਹ ਹੈ ॥੧॥" },
      { gurmukhi: "ਬਿਸਨੁ ਸਭਿ ਬਿਧਿ ਭਲੋ ਕਰਿ ਹੈਂ ॥" },
      { gurmukhi: "ਠਠੋਂ ਰਨ ਪੁੰਨ ਛੇਤ ਹੀ ॥੨॥" },
    ])).toEqual([0, 0, 0, 0, 0]);
  });

  it("keeps a ਰਹਾਉ refrain with the ਛੰਤ it closes (page 460, lines 15084-15096)", () => {
    expect(sectionIndexes([
      { gurmukhi: "ਛੰਤ ॥" },
      { gurmukhi: "ਤਾਂ ਤੇ ਰੇ ਮਨ ਢੀਲ ਨ ਕੀਜੈ ॥" },
      { gurmukhi: "ਹਰਿ ਕਰ ਜਿਹ ਬਿਧ ਮੀਚ ਮਰੀਜੈ ॥" },
      { gurmukhi: "ਭਲ ਦਾਵ ਅਉਸਰ ਬਨਯੋ ਨੀਕੋ ਬਿਲੰਬ ਸੰਕ ਨ ਕੀਜਿਯੇ ॥" },
      { gurmukhi: "ਕਰ ਸਮਰ ਸਨਮੁਖ ਜੁੱਧ ਹਰਿ ਸੰਗ ਨ ਹਰਿ ਕਰ ਦੀਜਿਥੈ ॥" },
      { gurmukhi: "ਹੋਇ ਮੁਕਤਿ ਯਾ ਬਪੁ ਆਸੁਰੀ ਹਰਿ ਪ੍ਰਾਨ ਮ੍ਰਿਤ ਜੈ ਪਾਈਐ ॥" },
      { gurmukhi: "ਬੇਗ ਉਧਰਨ ਹੋਇ ਯਾ ਤਨ ਹਰਿ ਸਰਨ ਸੀਘਰ ਸਿਧਾਈਐ ॥੧॥" },
      { gurmukhi: "ਸਭਿ ਮਿਟਹਿ ਕ੍ਰਿਤ ਅਪਕਰਮ ਸਗਰੇ ਪਰਾ ਪੂਰਬਲੇ ਪਾਪ ਹੇ ॥" },
      { gurmukhi: "ਅਬਿਬੇਕ ਮਾਨੇ ਦੋਖ ਨਸਿਹੈਂ ਮਿਟੇ ਤ੍ਰਿਬਿਧਿ ਤਾਪ ਹੇ ॥੧॥" },
      { gurmukhi: "ਰਹਾਉ ॥" },
      { gurmukhi: "ਸਲੋਕ ॥" },
      { gurmukhi: "ਯਾ ਬਪੁ ਮਲਿਨ ਨਿਸਾਚਰੀ ਅਉਗਨ ਭਯੋ ਮੂਲ ॥" },
      { gurmukhi: "ਨੀਚ ਕਰਮ ਜੇਤਿਕ ਬਿਦਿਤ ਸੋ ਯਾ ਕੇ ਅਨੁਕੂਲ ॥੧॥" },
    ])).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1]);
  });

  it("keeps a refrain of several ॥੧॥ lines before a numbered ਰਹਾਉ with its stanza (page 791)", () => {
    expect(sectionIndexes([
      { gurmukhi: "ਚੌਪਈ ॥" },
      { gurmukhi: "ਪਹਿਲੀ ਤੁਕ ਇਹ ਹੈ ॥" },
      { gurmukhi: "ਦੂਜੀ ਤੁਕ ਇਹ ਹੈ ॥੨॥੧੭੩॥" },
      { gurmukhi: "ਸਮੇ ਸਮੇ ਤੋ ਫਲ ਸਭਿ ਪ੍ਰਾਪਤ ਕਾਮ ਕਾਰਿ ਹਰਿ ਪ੍ਰਜਾ ਤੁਮਾਰੋ ॥" },
      { gurmukhi: "ਐਸੇ ਜੋ ਆਪ ਕਰਮ ਕਰਤਾ ਪੁਰਖੁ ਸ਼ਰਨ ਤੁਮਾਰੀ ਆਦਿ ਨਿਰੰਜਨ ॥੧॥" },
      { gurmukhi: "ਹੋਹੁ ਪ੍ਰਸੰਨ ਅਖਿਲ ਜਗ ਨਾਯਕ ॥੧॥" },
      { gurmukhi: "ਰਹਾਉ ॥੩॥੧੭੪॥੧੮੭੩॥੪੧੯੨॥" },
    ])).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("still starts a piece that opens SGGS-style, ॥੧॥ then ਰਹਾਉ then ॥੨॥ (page 6, lines 164-170)", () => {
    expect(sectionIndexes([
      { gurmukhi: "ਦੋਹਰਾ ॥" },
      { gurmukhi: "ਚਾਰ ਬੇਦ ਖਟ ਅਸਟਦਸ ਬਿਧਨਾ ਰਚਿ ਬਿਸਥਾਰ ॥" },
      { gurmukhi: "ਤੀਨ ਲੋਕ ਰਚਨਾ ਭਈ ਕਰਤਾ ਸਿਰਜਨਹਾਰ ॥੫੨॥" },
      { gurmukhi: "ਤੁਮ ਬਿਨ ਸਰੇ ਨ ਏਕ ਛਿਨ ਤੁਮ ਸਭ ਜੀਅਨ ਪ੍ਰਾਨ ॥" },
      { gurmukhi: "ਤੁਮ ਕਰਤਾ ਸਭਿ ਜਗਤ ਕੀ ਤੁਮ ਹੀ ਤੇ ਸਭਿ ਮਾਨ ॥੧॥" },
      { gurmukhi: "ਰਹਾਉ ॥" },
      { gurmukhi: "ਦੂਜੀ ਤੁਕ ਇਹ ਹੈ ॥" },
      { gurmukhi: "ਤੀਜੀ ਤੁਕ ਇਹ ਹੈ ॥੨॥" },
    ])).toEqual([0, 0, 0, 1, 1, 1, 1, 1]);
  });

  it("does not start a section at a numbered ਰਹਾਉ line itself", () => {
    expect(sectionIndexes([
      { gurmukhi: "ਚੌਪਈ ॥" },
      { gurmukhi: "ਪਹਿਲੀ ਤੁਕ ਇਹ ਹੈ ॥" },
      { gurmukhi: "ਦੂਜੀ ਤੁਕ ਇਹ ਹੈ ॥੨॥੧੨੯॥" },
      { gurmukhi: "ਹੋਹੁ ਪ੍ਰਸੰਨ ਹੇ ਪੁਰਖ ਸੁਜਾਨ ॥" },
      { gurmukhi: "ਰਹਾਉ ॥੧॥੩॥੧੩੦॥੧੮੨੯॥੪੧੪੮॥" },
    ])).toEqual([0, 0, 0, 0, 0]);
  });

  it("keeps a one-line ॥੧॥ label or colophon with the section it closes", () => {
    expect(sectionIndexes([
      { gurmukhi: "ਚੌਪਈ ॥" },
      { gurmukhi: "ਪਹਿਲੀ ਤੁਕ ਇਹ ਹੈ ॥" },
      { gurmukhi: "ਦੂਜੀ ਤੁਕ ਇਹ ਹੈ ॥੨੧॥੫੩॥" },
      { gurmukhi: "ਦਸਕ ਪਦ ਪੁਨਯਾਕੀ ਕੇ ॥੧॥੨੧॥੫੩॥੫੮੫॥੨੯੦੪॥" },
      { gurmukhi: "ਤੀਜੀ ਤੁਕ ਇਹ ਹੈ ॥" },
      { gurmukhi: "ਚਉਥੀ ਤੁਕ ਇਹ ਹੈ ॥੨੨॥" },
      { gurmukhi: "ਅੰਗਦ ਸੰਬਾਦ ਸਮਾਪਤਿ ॥੧॥" },
    ])).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("does not split at a header met mid-verse", () => {
    expect(sectionIndexes([
      { gurmukhi: "ਦੋਹਰਾ ॥" },
      { gurmukhi: "ਪਹਿਲੀ ਤੁਕ ॥" },
      { gurmukhi: "ਚੌਪਈ ॥" },
      { gurmukhi: "ਦੂਜੀ ਤੁਕ ॥੧॥" },
    ])).toEqual([0, 0, 0, 0]);
  });
});

describe("migration 064", () => {
  // The latest SQL twin of sectionIndexes (060, replaced by 062, then 064); its word lists must match these.
  const sql = readFileSync("supabase/migrations/064_sarbloh_refrains.sql", "utf8");
  const json = (name: string) => JSON.parse(new RegExp(`${name} constant jsonb := '([^']*)'`).exec(sql)![1]);
  const list = (name: string) => [...new RegExp(`${name} constant text\\[\\] := array\\[([^\\]]*)\\]`).exec(sql)![1].matchAll(/'([^']*)'/g)].map((m) => m[1]);

  it("uses the same word lists and limits as sectionIndexes", () => {
    expect(json("chhands")).toEqual(CHHANDS);
    expect(json("chhand_lines")).toEqual(CHHAND_LINES);
    expect(list("label_lines")).toEqual(LABEL_LINES);
    expect(list("trailer_lines")).toEqual(TRAILER_LINES);
    expect(list("label_endings")).toEqual(LABEL_ENDINGS);
    expect(list("colophon_words")).toEqual(COLOPHON_WORDS);
    expect(/bisanpad constant text := '([^']*)'/.exec(sql)![1]).toBe(BISANPAD.source);
    expect(sql).toContain("header_words constant int := 6;");
    expect(sql).toContain("label_numbered_words constant int := 2;");
    expect(sql).toContain(`${SARBLOH_SHABAD_BASE + 1} + u.section`);
  });
});

describe("toLines", () => {
  it("gives each line the shabad_id of its section, counting up from the Sarbloh base", () => {
    const ls = toLines([
      { text: "ਦੋਹਿਰਾ", ref: null, page: 1, breaks: [] },
      { text: "ਛਾਯਾ ਰੂਪੀ ਹੋਇ ਕੈ ਬਿਚਰਤ ਸ੍ਰੀ ਗੋਪਾਲ", ref: null, page: 1, breaks: [] },
      { text: "ਆਪਹਿ ਲਛਮੀ ਬਪੁ ਧਰੇ ਜੀੳ ਜੰਤੁ ਪ੍ਰਤਿਪਾਲ", ref: "1", page: 1, breaks: [] },
      { text: "ਚੌਪਈ", ref: null, page: 1, breaks: [] },
      { text: "ਸ੍ਰੀ ਮਾਯਾ ਮੁਖਿ ਕਰੋ ਉਚਾਰ", ref: null, page: 1, breaks: [] },
      { text: "ਦਰਿਦ੍ਰ ਸਾਗਰ ਤੇ ਲੇਹੁ ਉਬਾਰਿ", ref: "1", page: 1, breaks: [] },
    ]);
    expect(SARBLOH_SHABAD_BASE).toBeGreaterThan(555569); // above every BaniDB shabad id in the table
    expect(ls.map((l) => l.shabad_id)).toEqual([1, 1, 1, 2, 2, 2].map((n) => SARBLOH_SHABAD_BASE + n));
  });
});
