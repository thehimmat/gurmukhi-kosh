/**
 * Migration 084 (#23): the pad-arth builder's saved picks. A pick is one word, or a phrase (its
 * words may be apart), in one line; its refs are the gloss rows it was picked from. Ingests delete
 * and re-create those rows, so a ref keeps a snapshot of what was picked plus a stable key, its
 * row id goes null when the row is deleted, and padarth_relink_refs() reattaches it by that key.
 * The tables are the curator's: the API roles cannot read or write them.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { applyFrom, freshDb } from "./replay";
import { linesLoadSql } from "../../pipeline/shared/load-sql";

const M = "084_padarth_picks.sql";

// Japji line 9 as stored: ਕੂੜੈ (4) … ਪਾਲਿ (6) is a gapped phrase.
const LINE = "ਕਿਵ ਸਚਿਆਰਾ ਹੋਈਐ ਕਿਵ ਕੂੜੈ ਤੁਟੈ ਪਾਲਿ";
const lineId = "(select id from lines where verse_id = 9)";
const wordId = (g: string) => `(select id from words where gurmukhi = '${g}')`;
const shackle = "(select id from dict_sources where code = 'shackle')";

let db: PGlite;
beforeAll(async () => {
  db = await freshDb({ before: M });
  await db.exec(`
    insert into shabads (id, writer_id, writer_english, ang_start, source_fk)
      values (1, 1, 'Guru Nanak Dev Ji', 1, (select id from sources where code = 'sggs_banidb_v2'));
  `);
  await db.exec(linesLoadSql("sggs_banidb_v2", [{ verse_id: 9, ang: 1, line_no: 9, shabad_id: 1, gurmukhi: LINE }]).sql);
  await applyFrom(db, M);
}, 120_000);

const one = async <T>(sql: string) => (await db.query<T>(sql)).rows[0];
const count = async (sql: string) => Number((await one<{ n: number }>(`select count(*)::int as n from (${sql}) x`)).n);

async function gloss(ordinal: number, term: string, text: string): Promise<number> {
  return (
    await one<{ id: number }>(`
      insert into padarth_glosses (line_id, source_code, ordinal, kind, term, gloss, is_phrase)
      values (${lineId}, 'ss_padarth', ${ordinal}, 'entry', '${term}', '${text}', ${term.includes(" ")})
      returning id`)
  ).id;
}

async function definition(word: string, sense: number, text: string): Promise<number> {
  return (
    await one<{ id: number }>(`
      insert into definitions (word_id, dict_source_id, sense_number, definition_text)
      values (${wordId(word)}, ${shackle}, ${sense}, '${text}') returning id`)
  ).id;
}

async function pick(positions: number[], surface: string): Promise<number> {
  return (
    await one<{ id: number }>(`
      insert into padarth_picks (line_id, positions, surface_text, chosen_by)
      values (${lineId}, '{${positions.join(",")}}', '${surface}', 'curator') returning id`)
  ).id;
}

const glossRef = (pickId: number, ordinal: number, glossId: number, keyOrdinal: number, term: string, text: string) =>
  db.exec(`
    insert into padarth_pick_refs (pick_id, ordinal, ref_kind, source_code, padarth_gloss_id,
                                   key_line_id, key_ordinal, snapshot_term, snapshot_text)
    values (${pickId}, ${ordinal}, 'padarth_gloss', 'ss_padarth', ${glossId},
            ${lineId}, ${keyOrdinal}, '${term}', '${text}')`);

const definitionRef = (pickId: number, ordinal: number, defId: number, word: string, sense: number, text: string) =>
  db.exec(`
    insert into padarth_pick_refs (pick_id, ordinal, ref_kind, source_code, definition_id,
                                   key_word_id, key_sense_number, snapshot_term, snapshot_text)
    values (${pickId}, ${ordinal}, 'definition', 'shackle', ${defId},
            ${wordId(word)}, ${sense}, '${word}', '${text}')`);

describe(M, () => {
  it("stores a gapped phrase pick with its gloss, and a word pick with a definition and an override", async () => {
    const g = await gloss(1, "ਕੂੜੈ ਪਾਲਿ", "ਕੂੜ ਦੀ ਪਾਲਿ, ਕੂੜ ਦੀ ਕੰਧ");
    const phrase = await pick([4, 6], "ਕੂੜੈ ਪਾਲਿ");
    await glossRef(phrase, 0, g, 1, "ਕੂੜੈ ਪਾਲਿ", "ਕੂੜ ਦੀ ਪਾਲਿ, ਕੂੜ ਦੀ ਕੰਧ");

    const d = await definition("ਤੁਟੈ", 1, "be broken, break");
    const word = await pick([5], "ਤੁਟੈ");
    await definitionRef(word, 0, d, "ਤੁਟੈ", 1, "be broken, break");
    await db.exec(`update padarth_picks set override_text = 'is broken', note_text = 'see ਤੁਟਿ' where id = ${word}`);

    expect(await count(`select 1 from padarth_pick_refs where pick_id in (${phrase}, ${word})`)).toBe(2);
    expect(await one(`select provenance, review_status from padarth_picks where id = ${word}`)).toEqual({
      provenance: "human_verified",
      review_status: "unreviewed",
    });
  });

  it.each([
    ["empty", "{}"],
    ["unsorted", "{6,4}"],
    ["repeated", "{4,4}"],
    ["negative", "{-1}"],
  ])("refuses %s positions", async (_label, positions) => {
    await expect(
      db.exec(`insert into padarth_picks (line_id, positions, surface_text, chosen_by)
               values (${lineId}, '${positions}', 'x', 'curator')`)
    ).rejects.toThrow();
  });

  it("keeps one pick per line and span", async () => {
    await pick([0], "ਕਿਵ");
    await expect(pick([0], "ਕਿਵ")).rejects.toThrow(/duplicate key/);
  });

  it("refuses blank text: override, note, snapshot, line note", async () => {
    const p = await pick([1], "ਸਚਿਆਰਾ");
    await expect(db.exec(`update padarth_picks set override_text = '  ' where id = ${p}`)).rejects.toThrow();
    await expect(db.exec(`update padarth_picks set note_text = '' where id = ${p}`)).rejects.toThrow();
    await expect(glossRef(p, 0, await gloss(2, "ਸਚਿਆਰਾ", "ਸੱਚ ਵਾਲਾ"), 2, "ਸਚਿਆਰਾ", " ")).rejects.toThrow();
    await expect(
      db.exec(`insert into padarth_line_notes (line_id, note_text, chosen_by) values (${lineId}, ' ', 'curator')`)
    ).rejects.toThrow();
  });

  it("refuses a ref whose row id does not match its kind", async () => {
    const p = await pick([2], "ਹੋਈਐ");
    const d = await definition("ਹੋਈਐ", 1, "become");
    await expect(
      db.exec(`insert into padarth_pick_refs (pick_id, ordinal, ref_kind, source_code, definition_id,
                                              key_line_id, key_ordinal, snapshot_term, snapshot_text)
               values (${p}, 0, 'padarth_gloss', 'ss_padarth', ${d}, ${lineId}, 3, 'ਹੋਈਐ', 'become')`)
    ).rejects.toThrow();
    // A gloss ref needs its gloss key; a definition ref needs its word key.
    await expect(
      db.exec(`insert into padarth_pick_refs (pick_id, ordinal, ref_kind, source_code, snapshot_term, snapshot_text)
               values (${p}, 0, 'definition', 'shackle', 'ਹੋਈਐ', 'become')`)
    ).rejects.toThrow();
  });

  it("keeps one line note per line", async () => {
    await db.exec(`insert into padarth_line_notes (line_id, note_text, chosen_by) values (${lineId}, 'a note', 'curator')`);
    await expect(
      db.exec(`insert into padarth_line_notes (line_id, note_text, chosen_by) values (${lineId}, 'again', 'curator')`)
    ).rejects.toThrow(/duplicate key/);
  });

  it("refuses to delete a line that has picks", async () => {
    await expect(db.exec(`delete from lines where id = ${lineId}`)).rejects.toThrow(/foreign key/);
  });

  it("keeps a ref's snapshot when its row is deleted, and relinks it when the row comes back unchanged", async () => {
    const p = await pick([3], "ਕਿਵ");
    const before = await gloss(10, "ਕਿਵ", "ਕਿਵੇਂ, ਕਿਸ ਤਰ੍ਹਾਂ");
    await glossRef(p, 0, before, 10, "ਕਿਵ", "ਕਿਵੇਂ, ਕਿਸ ਤਰ੍ਹਾਂ");
    const def = await definition("ਕਿਵ", 1, "how?");
    await definitionRef(p, 1, def, "ਕਿਵ", 1, "how?");

    // A re-ingest: delete, then re-create with new ids (the gloss's ordinal moved too).
    await db.exec(`delete from padarth_glosses where id = ${before}; delete from definitions where id = ${def}`);
    expect(await one(`select padarth_gloss_id, snapshot_text from padarth_pick_refs where pick_id = ${p} and ordinal = 0`)).toEqual({
      padarth_gloss_id: null,
      snapshot_text: "ਕਿਵੇਂ, ਕਿਸ ਤਰ੍ਹਾਂ",
    });
    const after = await gloss(11, "ਕਿਵ", "ਕਿਵੇਂ, ਕਿਸ ਤਰ੍ਹਾਂ");
    const defAfter = await definition("ਕਿਵ", 1, "how?");

    const result = await one<{ relinked: number; unlinked: number }>(`select * from padarth_relink_refs()`);
    expect(result.relinked).toBe(2);
    expect(
      (await db.query(`select padarth_gloss_id, definition_id from padarth_pick_refs where pick_id = ${p} order by ordinal`)).rows
    ).toEqual([
      { padarth_gloss_id: after, definition_id: null },
      { padarth_gloss_id: null, definition_id: defAfter },
    ]);
  });

  it("leaves a ref unlinked when the text changed, and breaks ties between identical rows by ordinal", async () => {
    const p = await pick([6], "ਪਾਲਿ");
    const g = await gloss(20, "ਪਾਲਿ", "ਕੰਧ");
    await glossRef(p, 0, g, 20, "ਪਾਲਿ", "ਕੰਧ");
    const q = await pick([4], "ਕੂੜੈ");
    const h = await gloss(21, "ਕੂੜੈ", "ਕੂੜ ਦੀ");
    await glossRef(q, 0, h, 21, "ਕੂੜੈ", "ਕੂੜ ਦੀ");
    await db.exec(`delete from padarth_glosses where id in (${g}, ${h})`);

    await gloss(22, "ਪਾਲਿ", "ਕੰਧ, ਦੀਵਾਰ"); // reworded: not the gloss that was picked
    await gloss(30, "ਕੂੜੈ", "ਕੂੜ ਦੀ"); // two identical candidates; only one keeps ordinal 21
    const same = await gloss(21, "ਕੂੜੈ", "ਕੂੜ ਦੀ");

    await db.query(`select * from padarth_relink_refs()`);
    expect((await one<{ id: number | null }>(`select padarth_gloss_id as id from padarth_pick_refs where pick_id = ${p}`)).id).toBeNull();
    expect((await one<{ id: number }>(`select padarth_gloss_id as id from padarth_pick_refs where pick_id = ${q}`)).id).toBe(same);
    const { unlinked } = await one<{ unlinked: number }>(`select * from padarth_relink_refs()`);
    expect(unlinked).toBeGreaterThanOrEqual(1);
  });

  it.each(["anon", "authenticated"])("hides every table and the relink from %s", async (role) => {
    await db.exec(`set role ${role}`);
    try {
      for (const t of ["padarth_picks", "padarth_pick_refs", "padarth_line_notes"]) {
        await expect(db.query(`select 1 from ${t}`)).rejects.toThrow(/permission denied/);
      }
      await expect(db.query(`select * from padarth_relink_refs()`)).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });

  it("lets service_role run the relink", async () => {
    await db.exec("set role service_role");
    try {
      await expect(db.query(`select * from padarth_relink_refs()`)).resolves.toBeDefined();
    } finally {
      await db.exec("reset role");
    }
  });
});
