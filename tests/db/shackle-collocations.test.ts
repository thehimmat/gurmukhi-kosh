/**
 * Migration 087 (#163, #377): Shackle's phrases (dict_collocations), and picking one in the
 * pad-arth builder. A phrase pick's ref names the collocation, keeps a snapshot of its gloss and a
 * stable key (source + romanised phrase) so padarth_relink_refs() reattaches it after a re-ingest.
 * Curator-only, like Shackle's definitions (069): the API roles cannot read it.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { applyFrom, freshDb } from "./replay";
import { linesLoadSql } from "../../pipeline/shared/load-sql";

const M = "087_shackle_collocations.sql";
let db: PGlite;
let lineId: number;
const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const shackle = "(select id from dict_sources where code = 'shackle')";

async function collocation(phrase: string, gloss: string): Promise<number> {
  return (
    await one<{ id: number }>(
      `insert into dict_collocations (dict_source_id, source_entry, phrase_roman, phrase_gurmukhi, members, gloss, origin)
       values (${shackle}, 'e1', $1, 'ਇਤ ਉਤ', '[["ਇਤ"],["ਉਤ"]]', $2, 'usage') returning id`,
      [phrase, gloss]
    )
  ).id;
}

beforeAll(async () => {
  db = await freshDb({ before: M });
  await db.exec(`insert into shabads (id, writer_id, writer_english, ang_start, source_fk)
                 values (1, 1, 'Guru Nanak Dev Ji', 1, (select id from sources where code = 'sggs_banidb_v2'))`);
  await db.exec(linesLoadSql("sggs_banidb_v2", [{ verse_id: 9, ang: 1, line_no: 9, shabad_id: 1, gurmukhi: "ਇਤ ਉਤ ਸਭ" }]).sql);
  await applyFrom(db, M);
  lineId = (await one<{ id: number }>("select id from lines where verse_id = 9")).id;
}, 120_000);

const save = (refs: object[]) =>
  one<{ id: number }>(`select padarth_save_pick($1, '{0,1}', 'ਇਤ ਉਤ', null, null, $2::jsonb, 'curator') as id`, [lineId, JSON.stringify(refs)]);

describe("087 dict_collocations", () => {
  it("stores a phrase with its members and gloss, once per source, entry and phrase", async () => {
    await collocation("ita uta", "everywhere");
    await expect(collocation("ita uta", "again")).rejects.toThrow(/unique|duplicate/);
    const row = await one<{ members: string[][]; provenance: string }>(`select members, provenance from dict_collocations`);
    expect(row).toEqual({ members: [["ਇਤ"], ["ਉਤ"]], provenance: "imported" });
  });

  it("refuses a one-word phrase, a blank gloss and an unknown origin", async () => {
    const bad = (members: string, gloss: string, origin: string) =>
      db.query(
        `insert into dict_collocations (dict_source_id, source_entry, phrase_roman, phrase_gurmukhi, members, gloss, origin)
         values (${shackle}, 'e2', 'x', 'x', '${members}', '${gloss}', '${origin}')`
      );
    await expect(bad('[["ਇਤ"]]', "g", "usage")).rejects.toThrow(/check/);
    await expect(bad('[["ਇਤ"],["ਉਤ"]]', " ", "usage")).rejects.toThrow(/check/);
    await expect(bad('[["ਇਤ"],["ਉਤ"]]', "g", "guess")).rejects.toThrow(/check/);
  });

  it("saves a phrase pick that names a collocation, with its snapshot and key", async () => {
    const id = (await one<{ id: number }>(`select id from dict_collocations where phrase_roman = 'ita uta'`)).id;
    const pick = (await save([{ kind: "collocation", id }])).id;
    const ref = await one(`select ref_kind, source_code, collocation_id, key_phrase_roman, snapshot_term, snapshot_text from padarth_pick_refs where pick_id = $1`, [pick]);
    expect(ref).toEqual({ ref_kind: "collocation", source_code: "shackle", collocation_id: id, key_phrase_roman: "ita uta", snapshot_term: "ਇਤ ਉਤ", snapshot_text: "everywhere" });
  });

  it("keeps the snapshot when the phrase is deleted, and relinks it when it comes back unchanged", async () => {
    await db.exec(`delete from dict_collocations`);
    expect((await one<{ id: number | null }>(`select collocation_id as id from padarth_pick_refs where ref_kind = 'collocation'`)).id).toBeNull();
    const again = await collocation("ita uta", "everywhere");
    const { relinked } = await one<{ relinked: number }>(`select * from padarth_relink_refs()`);
    expect(relinked).toBe(1);
    expect((await one<{ id: number }>(`select collocation_id as id from padarth_pick_refs where ref_kind = 'collocation'`)).id).toBe(again);
  });

  it("still saves the other kinds", async () => {
    await expect(save([{ kind: "nope", id: 1 }])).rejects.toThrow(/unknown ref kind/);
  });

  it.each(["anon", "authenticated"])("is hidden from %s", async (role) => {
    await db.exec(`set role ${role}`);
    try {
      await expect(db.query(`select 1 from dict_collocations`)).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });
});
