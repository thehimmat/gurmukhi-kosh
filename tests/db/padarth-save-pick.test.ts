/**
 * Migration 085 (#23): padarth_save_pick() saves one pad-arth pick in one transaction. The caller
 * names the chosen rows only ({kind, id}); the function reads them and writes each ref's snapshot
 * and stable key itself, so a ref always says what the row said when it was picked. Saving with
 * nothing chosen, no override and no note removes the pick. service_role only.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { applyFrom, freshDb } from "./replay";
import { linesLoadSql } from "../../pipeline/shared/load-sql";

const M = "085_padarth_save_pick.sql";
const LINE = "ਕਿਵ ਸਚਿਆਰਾ ਹੋਈਐ ਕਿਵ ਕੂੜੈ ਤੁਟੈ ਪਾਲਿ";

let db: PGlite;
let lineId: number;
let otherLine: number;
let kooRaiPaal: number; // pad-arth gloss on the line
let elsewhere: number; // pad-arth gloss on another line
let tutaiDef: number;

const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];

beforeAll(async () => {
  db = await freshDb({ before: M });
  await db.exec(`insert into shabads (id, writer_id, writer_english, ang_start, source_fk)
                 values (1, 1, 'Guru Nanak Dev Ji', 1, (select id from sources where code = 'sggs_banidb_v2'))`);
  await db.exec(
    linesLoadSql("sggs_banidb_v2", [
      { verse_id: 9, ang: 1, line_no: 9, shabad_id: 1, gurmukhi: LINE },
      { verse_id: 10, ang: 1, line_no: 10, shabad_id: 1, gurmukhi: "ਹੁਕਮਿ ਰਜਾਈ ਚਲਣਾ" },
    ]).sql
  );
  await applyFrom(db, M);
  lineId = (await one<{ id: number }>("select id from lines where verse_id = 9")).id;
  otherLine = (await one<{ id: number }>("select id from lines where verse_id = 10")).id;
  const gloss = async (line: number, ordinal: number, term: string, text: string) =>
    (
      await one<{ id: number }>(
        `insert into padarth_glosses (line_id, source_code, ordinal, kind, term, gloss, is_phrase)
         values ($1, 'ss_padarth', $2, 'entry', $3, $4, $5) returning id`,
        [line, ordinal, term, text, term.includes(" ")]
      )
    ).id;
  kooRaiPaal = await gloss(lineId, 2, "ਕੂੜੈ ਪਾਲਿ", "ਕੂੜ ਦੀ ਕੰਧ");
  elsewhere = await gloss(otherLine, 0, "ਹੁਕਮਿ", "ਹੁਕਮ ਵਿਚ");
  tutaiDef = (
    await one<{ id: number }>(
      `insert into definitions (word_id, dict_source_id, sense_number, definition_text)
       values ((select id from words where gurmukhi = 'ਤੁਟੈ'), (select id from dict_sources where code = 'shackle'), 2, 'be broken')
       returning id`
    )
  ).id;
}, 120_000);

const save = (positions: number[], surface: string, refs: { kind: string; id: number }[], override: string | null = null, note: string | null = null) =>
  one<{ id: number | null }>(`select padarth_save_pick($1, $2, $3, $4, $5, $6::jsonb, 'curator') as id`, [
    lineId,
    `{${positions.join(",")}}`,
    surface,
    override,
    note,
    JSON.stringify(refs),
  ]);

const refsOf = async (pickId: number) =>
  (
    await db.query(
      `select ordinal, ref_kind, source_code, padarth_gloss_id, definition_id, key_line_id, key_ordinal,
              key_word_id, key_sense_number, snapshot_term, snapshot_text
         from padarth_pick_refs where pick_id = $1 order by ordinal`,
      [pickId]
    )
  ).rows;

describe(M, () => {
  it("writes a pick and builds each ref's snapshot and key from the row it names", async () => {
    const { id } = await save([4, 6], "ਕੂੜੈ … ਪਾਲਿ", [{ kind: "padarth_gloss", id: kooRaiPaal }]);
    expect(id).not.toBeNull();
    expect(await refsOf(id!)).toEqual([
      {
        ordinal: 0, ref_kind: "padarth_gloss", source_code: "ss_padarth", padarth_gloss_id: kooRaiPaal, definition_id: null,
        key_line_id: lineId, key_ordinal: 2, key_word_id: null, key_sense_number: null,
        snapshot_term: "ਕੂੜੈ ਪਾਲਿ", snapshot_text: "ਕੂੜ ਦੀ ਕੰਧ",
      },
    ]);

    const word = await save([5], "ਤੁਟੈ", [{ kind: "definition", id: tutaiDef }]);
    expect(await refsOf(word.id!)).toEqual([
      expect.objectContaining({
        ref_kind: "definition", source_code: "shackle", definition_id: tutaiDef, padarth_gloss_id: null,
        key_word_id: expect.any(Number), key_sense_number: 2, snapshot_term: "ਤੁਟੈ", snapshot_text: "be broken",
      }),
    ]);
  });

  it("replaces the refs, override and note on a second save, keeping the same pick", async () => {
    const first = await save([5], "ਤੁਟੈ", [{ kind: "definition", id: tutaiDef }]);
    const again = await save([5], "ਤੁਟੈ", [], "is broken", "  ");
    expect(again.id).toBe(first.id);
    expect(await refsOf(again.id!)).toEqual([]);
    expect(await one(`select override_text, note_text from padarth_picks where id = $1`, [again.id])).toEqual({
      override_text: "is broken",
      note_text: null,
    });
  });

  it("removes the pick when nothing is chosen and there is no override or note", async () => {
    const { id } = await save([0], "ਕਿਵ", [{ kind: "definition", id: tutaiDef }]);
    expect((await save([0], "ਕਿਵ", [], " ", null)).id).toBeNull();
    expect((await one<{ n: number }>(`select count(*)::int as n from padarth_picks where id = $1`, [id])).n).toBe(0);
  });

  it("refuses a pad-arth gloss from another line, a row that does not exist, and an unknown kind, saving nothing", async () => {
    const before = (await one<{ n: number }>(`select count(*)::int as n from padarth_pick_refs`)).n;
    await expect(save([1], "ਸਚਿਆਰਾ", [{ kind: "padarth_gloss", id: elsewhere }])).rejects.toThrow(/not on line/);
    await expect(save([1], "ਸਚਿਆਰਾ", [{ kind: "definition", id: 99999999 }])).rejects.toThrow(/no definition/);
    await expect(save([1], "ਸਚਿਆਰਾ", [{ kind: "word_grammar", id: 1 }])).rejects.toThrow(/kind/);
    expect((await one<{ n: number }>(`select count(*)::int as n from padarth_pick_refs`)).n).toBe(before);
    expect((await one<{ n: number }>(`select count(*)::int as n from padarth_picks where positions = '{1}'`)).n).toBe(0);
  });

  it("is service_role's only", async () => {
    const can = async (role: string) =>
      (
        await one<{ ok: boolean }>(
          `select has_function_privilege('${role}', 'padarth_save_pick(bigint, integer[], text, text, text, jsonb, text)', 'execute') as ok`
        )
      ).ok;
    expect(await can("anon")).toBe(false);
    expect(await can("authenticated")).toBe(false);
    expect(await can("service_role")).toBe(true);
  });
});
