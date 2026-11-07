/**
 * Migration 088 (#179 item 4): a pad-arth gloss link can be a 'compound' match, the same letters
 * spaced differently from the line. Nothing else about the links changes.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { applyFrom, freshDb } from "./replay";
import { linesLoadSql } from "../../pipeline/shared/load-sql";

const M = "088_padarth_compound_match.sql";
let db: PGlite;
let glossId: number;
const one = async <T>(sql: string) => (await db.query<T>(sql)).rows[0];

beforeAll(async () => {
  db = await freshDb({ before: M });
  await db.exec(`insert into shabads (id, writer_id, writer_english, ang_start, source_fk)
                 values (1, 1, 'Guru Nanak Dev Ji', 1, (select id from sources where code = 'sggs_banidb_v2'))`);
  await db.exec(linesLoadSql("sggs_banidb_v2", [{ verse_id: 1, ang: 1, line_no: 1, shabad_id: 1, gurmukhi: "ਝਿਲਿ ਮਿਲਿ ਕਾਰੁ" }]).sql);
  await applyFrom(db, M);
  glossId = (
    await one<{ id: number }>(`insert into padarth_glosses (line_id, source_code, ordinal, kind, term, gloss, is_phrase)
                               values ((select id from lines where verse_id = 1), 'ss_padarth', 0, 'entry', 'ਝਿਲਿਮਿਲਿਕਾਰੁ', 'ਚਮਕਾਰਾ', false) returning id`)
  ).id;
}, 120_000);

const occ = (position: number) => `(select o.id from word_occurrences o join lines l on l.id = o.line_id where l.verse_id = 1 and o.position = ${position})`;

describe("088 compound match", () => {
  it("links a gloss to each word of a compound", async () => {
    for (const p of [0, 1, 2]) {
      await db.query(`insert into padarth_gloss_occurrences (gloss_id, word_occurrence_id, match) values (${glossId}, ${occ(p)}, 'compound')`);
    }
    expect((await one<{ n: number }>(`select count(*)::int as n from padarth_gloss_occurrences where match = 'compound'`)).n).toBe(3);
  });

  it("still refuses an unknown match, and a via_base link without its lexeme", async () => {
    await expect(db.query(`insert into padarth_gloss_occurrences (gloss_id, word_occurrence_id, match) values (${glossId}, ${occ(0)}, 'fuzzy')`)).rejects.toThrow(/check|duplicate/);
    await db.exec(`delete from padarth_gloss_occurrences`);
    await expect(db.query(`insert into padarth_gloss_occurrences (gloss_id, word_occurrence_id, match) values (${glossId}, ${occ(0)}, 'fuzzy')`)).rejects.toThrow(/check/);
    await expect(db.query(`insert into padarth_gloss_occurrences (gloss_id, word_occurrence_id, match) values (${glossId}, ${occ(0)}, 'via_base')`)).rejects.toThrow(/check/);
  });
});
