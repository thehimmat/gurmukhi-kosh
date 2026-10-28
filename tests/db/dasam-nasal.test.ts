/**
 * Migration 076: BaniDB's ਾਂ after a vowel sign in the Dasam Granth (pipeline/sggs/nasal-corrections.ts).
 * Like 073 it rewrites each line and rebuilds what hangs off it, but most corrected spellings are new
 * words, so it also creates those, with the search key lib/gurmukhi-fold.ts gives them.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { applyFrom, freshDb } from "./replay";
import { linesLoadSql } from "../../pipeline/shared/load-sql";
import { foldGurmukhi } from "../../lib/gurmukhi-fold";
import { NASAL } from "../../pipeline/sggs/nasal-corrections";

const M = "076_dasam_kanna_nasal.sql";
// BaniDB's own text (its ਜ਼ is the one code point U+0A5B).
const fix = (verse: number) => NASAL.find((c) => c.verseId === verse)!;
const dasam = (verse: number, ang: number) =>
  ({ verse_id: verse, ang, line_no: verse, shabad_id: null, gurmukhi: fix(verse).from });

let db: PGlite;
beforeAll(async () => {
  db = await freshDb({ before: M });
  // ਸੁਨਾਊਂ is already a word, as in production; ਦਾਨਵੇਂਦ੍ਰਾਨ is not.
  await db.exec(linesLoadSql("sggs_banidb_v2", [
    { verse_id: 1, ang: 1, line_no: 1, shabad_id: null, gurmukhi: "ਤਬਹਿ ਗੀਤ ਮੰਗਲ ਫਤਹਿ ਕੇ ਸੁਨਾਊਂ ॥" },
  ]).sql);
  await db.exec(linesLoadSql("dasam_banidb_v2", [
    dasam(79012, 101), dasam(83565, 198), dasam(93910, 451), dasam(141856, 1427),
  ]).sql);
  await db.exec(`
    update lines set transliteration_en = 'old';
    update words w set frequency = (select count(*) from word_occurrences o where o.word_id = w.id);
    insert into word_corpus_stats (word_id, source_fk, frequency)
      select o.word_id, l.source_fk, count(*) from word_occurrences o join lines l on l.id = o.line_id group by 1, 2;
    insert into number_occurrences (line_id, value, role, keyword, char_start, char_end)
      select id, 1540, 'verse_marker', null, 37, 41 from lines where verse_id = 93910;
  `);
  await applyFrom(db, M);
}, 60_000);

const q = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const words = async (verse: number) =>
  (await q<{ g: string }>(
    `select w.gurmukhi g from word_occurrences o join words w on w.id = o.word_id
     join lines l on l.id = o.line_id where l.verse_id = $1 and l.source_fk = 3 order by o.position`, [verse])).map((r) => r.g);
const word = async (g: string) =>
  (await q<{ f: number; s: string | null }>("select frequency f, search_fold s from words where gurmukhi = $1", [g]))[0];

describe("076: ਾਂ after a vowel sign in the Dasam Granth", () => {
  it("rewrites the lines and their transliteration", async () => {
    const rows = await q<{ v: number; g: string; t: string }>(
      "select verse_id v, gurmukhi g, transliteration_en t from lines where source_fk = 3 order by verse_id");
    expect(rows).toEqual([
      { v: 79012, g: "ਸਿਰੰ ਦਾਨਵੇਂਦ੍ਰਾਨ ਕੇ ਤਾਕਿ ਝਾਰੇ ॥", t: "sira(n) dhaanave(n)dhraan ke taak jhaare ||" },
      { v: 83565, g: "ਬਾਤ ਪੁਰਾਤਨ ਭਾਖ ਸੁਨਾਊਂ ॥", t: "baat puraatan bhaakh sunaauoo(n) ||" },
      { v: 93910, g: "ਆਪੁਨੇ ਦਲਹਿ ਜਗਾਇ ਕਹੋ ਜੂਝ ਏਊ ਕਰਹਿ ॥੧੫੪੦॥", t: "aapune dhaleh jagai kaho joojh euoo kareh ||1540||" },
      { v: 141856, g: fix(141856).to, t: "vazaa(n) raa b bakhhasheedh hukame raheem ||57||" },
    ]);
  });

  it("creates the spellings that were not yet words, with their search key", async () => {
    expect(await word("ਦਾਨਵੇਂਦ੍ਰਾਨ")).toEqual({ f: 1, s: foldGurmukhi("ਦਾਨਵੇਂਦ੍ਰਾਨ") });
    const vazan = fix(141856).to.split(" ")[0];
    expect(vazan.normalize("NFD")).toBe("ਵਜ਼ਾਂ".normalize("NFD"));
    expect(await word(vazan)).toEqual({ f: 1, s: foldGurmukhi(vazan) });
    expect(await words(79012)).toEqual(["ਸਿਰੰ", "ਦਾਨਵੇਂਦ੍ਰਾਨ", "ਕੇ", "ਤਾਕਿ", "ਝਾਰੇ"]);
    expect(await words(141856)).toEqual(fix(141856).to.replace(" ॥੫੭॥", "").split(" "));
    expect((await words(141856))[4]).toBe("ਹੁਕਮੇ");
  });

  it("counts an existing spelling once more and drops the emptied misspelling", async () => {
    expect((await word("ਸੁਨਾਊਂ")).f).toBe(2);
    const gone = ["ਸੁਨਾਊਾਂ", "ਦਾਨਵੇਾਂਦ੍ਰਾਨ", "ਹੁਕਮੇਾਂ", fix(141856).from.split(" ")[0]];
    expect(await q("select gurmukhi from words where gurmukhi = any($1)", [gone])).toEqual([]);
    const corpus = await q<{ s: number; f: number }>(
      `select s.source_fk::int s, s.frequency f from word_corpus_stats s join words w on w.id = s.word_id
       where w.gurmukhi = 'ਸੁਨਾਊਂ' order by 1`);
    expect(corpus).toEqual([{ s: 1, f: 1 }, { s: 3, f: 1 }]);
  });

  it("shifts numeral offsets after a shorter word", async () => {
    const [r] = await q<{ s: number; e: number; g: string }>(
      "select n.char_start s, n.char_end e, l.gurmukhi g from number_occurrences n join lines l on l.id = n.line_id");
    expect([...r.g].slice(r.s, r.e).join("")).toBe("੧੫੪੦");
  });

  it("refreshes the cached totals the health page shows (075)", async () => {
    const [r] = await q<{ cached: number; actual: number }>(
      "select (stats->>'total_words')::int cached, (select count(*)::int from words) actual from health_stats_cache");
    expect(r.cached).toBe(r.actual);
  });

  it("is safe to run again", async () => {
    await applyFrom(db, M);
    expect(await words(83565)).toEqual(["ਬਾਤ", "ਪੁਰਾਤਨ", "ਭਾਖ", "ਸੁਨਾਊਂ"]);
    expect((await word("ਸੁਨਾਊਂ")).f).toBe(2);
    const [r] = await q<{ s: number }>("select char_start s from number_occurrences");
    expect(r.s).toBe(33);
  });
});
