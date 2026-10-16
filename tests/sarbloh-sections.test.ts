import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  sectionIndexes, toLines, SARBLOH_SHABAD_BASE,
  CHHANDS, CHHAND_LINES, LABEL_LINES, TRAILER_LINES, LABEL_ENDINGS, COLOPHON_WORDS,
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

  it("does not split at a header met mid-verse", () => {
    expect(sectionIndexes([
      { gurmukhi: "ਦੋਹਰਾ ॥" },
      { gurmukhi: "ਪਹਿਲੀ ਤੁਕ ॥" },
      { gurmukhi: "ਚੌਪਈ ॥" },
      { gurmukhi: "ਦੂਜੀ ਤੁਕ ॥੧॥" },
    ])).toEqual([0, 0, 0, 0]);
  });
});

describe("migration 060", () => {
  // The backfill applies the same rules in SQL; its word lists must match these.
  const sql = readFileSync("supabase/migrations/060_sarbloh_shabads.sql", "utf8");
  const json = (name: string) => JSON.parse(new RegExp(`${name} constant jsonb := '([^']*)'`).exec(sql)![1]);
  const list = (name: string) => [...new RegExp(`${name} constant text\\[\\] := array\\[([^\\]]*)\\]`).exec(sql)![1].matchAll(/'([^']*)'/g)].map((m) => m[1]);

  it("uses the same word lists and limits as sectionIndexes", () => {
    expect(json("chhands")).toEqual(CHHANDS);
    expect(json("chhand_lines")).toEqual(CHHAND_LINES);
    expect(list("label_lines")).toEqual(LABEL_LINES);
    expect(list("trailer_lines")).toEqual(TRAILER_LINES);
    expect(list("label_endings")).toEqual(LABEL_ENDINGS);
    expect(list("colophon_words")).toEqual(COLOPHON_WORDS);
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
