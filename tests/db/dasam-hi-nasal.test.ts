/**
 * Migration 077: the last seven Dasam lines with BaniDB's ਾਂ after a vowel sign, all a nasal after ਹਿ
 * (pipeline/sggs/nasal-corrections.ts NASAL_HI). Same steps as 076; the corrected spellings are new words.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { applyFrom, freshDb } from "./replay";
import { linesLoadSql } from "../../pipeline/shared/load-sql";
import { foldGurmukhi } from "../../lib/gurmukhi-fold";
import { NASAL_HI } from "../../pipeline/sggs/nasal-corrections";

const M = "077_dasam_hi_nasal.sql";
const fix = (verse: number) => NASAL_HI.find((c) => c.verseId === verse)!;

let db: PGlite;
beforeAll(async () => {
  db = await freshDb({ before: M });
  await db.exec(linesLoadSql("dasam_banidb_v2", [118908, 126247].map((v) =>
    ({ verse_id: v, ang: 979, line_no: v, shabad_id: null, gurmukhi: fix(v).from }))).sql);
  await db.exec("update words w set frequency = (select count(*) from word_occurrences o where o.word_id = w.id)");
  await applyFrom(db, M);
}, 60_000);

const q = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const word = async (g: string) =>
  (await q<{ f: number; s: string | null }>("select frequency f, search_fold s from words where gurmukhi = $1", [g]))[0];

describe("077: a nasal after ਹਿ in the last seven Dasam lines", () => {
  it("rewrites the lines: a bindi in 118908, a tippi in 126247", async () => {
    const rows = await q<{ v: number; g: string; t: string }>(
      "select verse_id v, gurmukhi g, transliteration_en t from lines where source_fk = 3 order by verse_id");
    expect(rows.map((r) => r.g)).toEqual(["ਡਿਮਿ ਡਿਮਿ ਡਿਮਿ ਡਾਮਰੂ ਡਮਕਹਿਂ ॥", "ਅਮਿਤਿ ਸੁਭਟ ਧਾਵਹਿੰ ਮਿਲਿ ਕੋਈ ॥੩੭॥"]);
    expect(rows.map((r) => r.t)).toEqual([fix(118908).translitTo, fix(126247).translitTo]);
  });

  it("creates the corrected spellings and drops the misspellings", async () => {
    expect(await word("ਡਮਕਹਿਂ")).toEqual({ f: 1, s: foldGurmukhi("ਡਮਕਹਿਂ") });
    expect(await word("ਧਾਵਹਿੰ")).toEqual({ f: 1, s: foldGurmukhi("ਧਾਵਹਿੰ") });
    expect(await q("select gurmukhi from words where gurmukhi = any($1)", [["ਡਮਕਹਿਾਂ", "ਧਾਵਹਿਾਂ"]])).toEqual([]);
  });

  it("is safe to run again", async () => {
    await applyFrom(db, M);
    expect((await word("ਧਾਵਹਿੰ")).f).toBe(1);
  });
});
