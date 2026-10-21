/**
 * Migration 068: four Sarbloh lines were typed with a doubled halant (ਛਤ੍੍ਰ). The fix collapses it in
 * the lines and in the words built from them: a misspelt word whose correct spelling is already a
 * word merges into it, and one whose correct spelling is new is renamed.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { applyFrom, freshDb } from "./replay";
import { linesLoadSql } from "../../pipeline/shared/load-sql";

const H = "੍";
const CHHATAR = `ਛਤ${H}ਰ`; // already a word elsewhere
const NRIPBAR = `ਨ${H}ਪਬਰ`; // only ever misspelt
const M = "068_sarbloh_doubled_halant.sql";

let db: PGlite;
beforeAll(async () => {
  db = await freshDb({ before: M });
  await db.exec(linesLoadSql("sggs_banidb_v2", [{ verse_id: 1, ang: 1, line_no: 1, shabad_id: null, gurmukhi: `${CHHATAR} ਸਿਰਿ ॥` }]).sql);
  await db.exec(linesLoadSql("sarbloh_budha_dal", [
    { verse_id: 1, ang: 713, line_no: 1, shabad_id: null, gurmukhi: `ਛਤ${H}${H}ਰ ਚਉਰ ॥` },
    { verse_id: 2, ang: 667, line_no: 2, shabad_id: null, gurmukhi: `ਨ${H}${H}ਪਬਰ ਬਿਬੇਕੋ ॥` },
  ]).sql);
  // Frequencies and stats as the refresh functions would leave them.
  await db.exec(`
    update words w set frequency = (select count(*) from word_occurrences o where o.word_id = w.id),
                       search_fold = gurmukhi;
    insert into word_corpus_stats (word_id, source_fk, frequency)
      select o.word_id, l.source_fk, count(*) from word_occurrences o join lines l on l.id = o.line_id group by 1, 2;
    insert into word_corpus_writer_stats (word_id, source_fk, writer_english, frequency)
      select o.word_id, l.source_fk, null, count(*) from word_occurrences o join lines l on l.id = o.line_id group by 1, 2;
  `);
  await applyFrom(db, M);
}, 60_000);

const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

describe("068: doubled halant in Sarbloh", () => {
  it("collapses it in the lines", async () => {
    const rows = await one<{ gurmukhi: string }>("select gurmukhi from lines order by id");
    expect(rows.map((r) => r.gurmukhi)).toEqual([`${CHHATAR} ਸਿਰਿ ॥`, `${CHHATAR} ਚਉਰ ॥`, `${NRIPBAR} ਬਿਬੇਕੋ ॥`]);
  });

  it("leaves no misspelt word behind", async () => {
    expect(await one(`select gurmukhi from words where strpos(gurmukhi, $1) > 0`, [H + H])).toEqual([]);
  });

  it("merges a misspelling into the word it should have been, with its counts", async () => {
    const [w] = await one<{ id: number; frequency: number }>("select id, frequency from words where gurmukhi = $1", [CHHATAR]);
    expect(w.frequency).toBe(2);
    const occ = await one<{ n: number }>("select count(*)::int n from word_occurrences where word_id = $1", [w.id]);
    expect(occ[0].n).toBe(2);
    const stats = await one<{ source_fk: number; frequency: number }>(
      "select source_fk::int, frequency from word_corpus_stats where word_id = $1 order by source_fk", [w.id]);
    expect(stats).toEqual([{ source_fk: 1, frequency: 1 }, { source_fk: 4, frequency: 1 }]);
    const writer = await one<{ n: number }>("select sum(frequency)::int n from word_corpus_writer_stats where word_id = $1", [w.id]);
    expect(writer[0].n).toBe(2);
  });

  it("renames a misspelling with no correct twin, fold included", async () => {
    const rows = await one<{ frequency: number; search_fold: string }>(
      "select frequency, search_fold from words where gurmukhi = $1", [NRIPBAR]);
    expect(rows).toEqual([{ frequency: 1, search_fold: NRIPBAR }]);
  });

  it("is safe to run again", async () => {
    await applyFrom(db, M);
    const rows = await one<{ n: number }>("select count(*)::int n from words where gurmukhi = $1", [CHHATAR]);
    expect(rows[0].n).toBe(1);
  });
});
