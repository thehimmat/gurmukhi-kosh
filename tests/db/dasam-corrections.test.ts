/**
 * Migration 073: lines BaniDB mistyped in the Dasam Granth (pipeline/sggs/corrections.ts). The fix
 * rewrites each line and rebuilds what hangs off it: its word occurrences, the frequencies and
 * stats of every word it touched, its first-letter key and its numeral offsets. A misspelling
 * left with no occurrence and nothing attached is deleted.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { applyFrom, freshDb } from "./replay";
import { linesLoadSql } from "../../pipeline/shared/load-sql";

const M = "073_dasam_banidb_corrections.sql";

let db: PGlite;
beforeAll(async () => {
  db = await freshDb({ before: M });
  // The corrected spellings are already words elsewhere, as in production.
  await db.exec(linesLoadSql("sggs_banidb_v2", [
    { verse_id: 1, ang: 1, line_no: 1, shabad_id: null, gurmukhi: "ਮੁਹਿ ਕਹਾ ਨ ਭਾਂਗ ਤੈਂ ॥" },
    { verse_id: 2, ang: 1, line_no: 2, shabad_id: null, gurmukhi: "ਵਡੈ ਭਾਗ ਪਾਇਆ ॥" },
  ]).sql);
  await db.exec(linesLoadSql("dasam_banidb_v2", [
    { verse_id: 80315, ang: 126, line_no: 80315, shabad_id: null, gurmukhi: "ਦੁਹਾ ਕੰਧਾਰਾ ਮੁਿਹ ਜੁੜੇ ਅਣੀਆਰਾ ਚੋਈਆਂ ॥" },
    { verse_id: 130072, ang: 1194, line_no: 130072, shabad_id: null, gurmukhi: "ਤਾਂੈ ਹਮਰੀ ਬਾਤ ਕਹ ਜਾਨੈ ॥" },
    { verse_id: 130073, ang: 1194, line_no: 130073, shabad_id: null, gurmukhi: "ਭਾਗ ਖਾਇ ਕੈ ਬੈਨ ਪ੍ਰਮਾਨੈ ॥੩੬॥" },
  ]).sql);
  await db.exec(`
    update lines set transliteration_en = 'old';
    update words w set frequency = (select count(*) from word_occurrences o where o.word_id = w.id);
    insert into word_corpus_stats (word_id, source_fk, frequency)
      select o.word_id, l.source_fk, count(*) from word_occurrences o join lines l on l.id = o.line_id group by 1, 2;
    insert into word_corpus_writer_stats (word_id, source_fk, writer_english, frequency)
      select o.word_id, l.source_fk, null, count(*) from word_occurrences o join lines l on l.id = o.line_id group by 1, 2;
    update lines l set first_letters = f.letters from (
      select o.line_id, first_letter_fold(string_agg(left(w.gurmukhi, 1), '' order by o.position)) letters
      from word_occurrences o join words w on w.id = o.word_id group by 1) f where f.line_id = l.id;
    insert into number_occurrences (line_id, value, role, keyword, char_start, char_end)
      select id, 36, 'verse_marker', null, 24, 26 from lines where verse_id = 130073;
  `);
  await applyFrom(db, M);
}, 60_000);

const q = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const words = async (verse: number) =>
  (await q<{ g: string }>(
    `select w.gurmukhi g from word_occurrences o join words w on w.id = o.word_id
     join lines l on l.id = o.line_id where l.verse_id = $1 and l.source_fk = 3 order by o.position`, [verse])).map((r) => r.g);
const freq = async (g: string) => (await q<{ f: number }>("select frequency f from words where gurmukhi = $1", [g]))[0]?.f;

describe("073: BaniDB corrections in the Dasam Granth", () => {
  it("rewrites the lines and their transliteration", async () => {
    const rows = await q<{ g: string; t: string }>(
      "select gurmukhi g, transliteration_en t from lines where source_fk = 3 order by verse_id");
    expect(rows).toEqual([
      { g: "ਦੁਹਾ ਕੰਧਾਰਾ ਮੁਹਿ ਜੁੜੇ ਅਣੀਆਰਾ ਚੋਈਆਂ ॥", t: "dhuhaa ka(n)dhaaraa muh juRe aneeaaraa choieeaa(n) ||" },
      { g: "ਤੈਂ ਹਮਰੀ ਬਾਤ ਨ ਕਹਾ ਜਾਨੈ ॥", t: "tai(n) hamaree baat na kahaa jaanai ||" },
      { g: "ਭਾਂਗ ਖਾਇ ਕੈ ਬੈਨ ਪ੍ਰਮਾਨੈ ॥੩੬॥", t: "bhaa(n)g khai kai bain pramaanai ||36||" },
    ]);
  });

  it("rebuilds each line's words in order, a new word included", async () => {
    expect(await words(80315)).toEqual(["ਦੁਹਾ", "ਕੰਧਾਰਾ", "ਮੁਹਿ", "ਜੁੜੇ", "ਅਣੀਆਰਾ", "ਚੋਈਆਂ"]);
    expect(await words(130072)).toEqual(["ਤੈਂ", "ਹਮਰੀ", "ਬਾਤ", "ਨ", "ਕਹਾ", "ਜਾਨੈ"]);
  });

  it("deletes the misspellings it emptied", async () => {
    expect(await q("select gurmukhi from words where gurmukhi in ('ਮੁਿਹ', 'ਤਾਂੈ')")).toEqual([]);
  });

  it("keeps a word still used elsewhere, with its count", async () => {
    expect(await freq("ਭਾਗ")).toBe(1);
    expect(await freq("ਕਹ")).toBeUndefined(); // only ever in the mistyped line here
    expect(await freq("ਭਾਂਗ")).toBe(2);
    expect(await freq("ਮੁਹਿ")).toBe(2);
    expect(await freq("ਨ")).toBe(2);
  });

  it("moves the per-corpus counts with them", async () => {
    const rows = await q<{ s: number; f: number }>(
      `select s.source_fk::int s, s.frequency f from word_corpus_stats s join words w on w.id = s.word_id
       where w.gurmukhi = 'ਭਾਂਗ' order by 1`);
    expect(rows).toEqual([{ s: 1, f: 1 }, { s: 3, f: 1 }]);
    const writer = await q<{ f: number }>(
      `select sum(s.frequency)::int f from word_corpus_writer_stats s join words w on w.id = s.word_id where w.gurmukhi = 'ਨ'`);
    expect(writer[0].f).toBe(2);
  });

  it("refreshes the first-letter key of a line that gained a word", async () => {
    const [r] = await q<{ f: string }>("select first_letters f from lines where verse_id = 130072 and source_fk = 3");
    expect(r.f).toBe("ਤਹਬਨਕਜ");
  });

  it("shifts numeral offsets after a longer word", async () => {
    const [r] = await q<{ s: number; e: number; g: string }>(
      `select n.char_start s, n.char_end e, l.gurmukhi g from number_occurrences n join lines l on l.id = n.line_id`);
    expect([...r.g].slice(r.s, r.e).join("")).toBe("੩੬");
  });

  it("is safe to run again", async () => {
    await applyFrom(db, M);
    expect(await words(130072)).toEqual(["ਤੈਂ", "ਹਮਰੀ", "ਬਾਤ", "ਨ", "ਕਹਾ", "ਜਾਨੈ"]);
    expect(await freq("ਭਾਂਗ")).toBe(2);
    const [r] = await q<{ s: number }>("select char_start s from number_occurrences");
    expect(r.s).toBe(25);
  });
});
