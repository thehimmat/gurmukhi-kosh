/**
 * Migration 086 (#23): pauri-level commentary for the pad-arth: an introduction, and a question,
 * each set before a line. One of each kind per line. The curator's, like 084: the API roles cannot
 * read or write it.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { applyFrom, freshDb } from "./replay";
import { linesLoadSql } from "../../pipeline/shared/load-sql";

const M = "086_padarth_commentary.sql";
const lineId = (v: number) => `(select id from lines where verse_id = ${v})`;

let db: PGlite;
beforeAll(async () => {
  db = await freshDb({ before: M });
  await db.exec(`
    insert into shabads (id, writer_id, writer_english, ang_start, source_fk)
      values (1, 1, 'Guru Nanak Dev Ji', 1, (select id from sources where code = 'sggs_banidb_v2'));
  `);
  await db.exec(
    linesLoadSql("sggs_banidb_v2", [
      { verse_id: 5, ang: 1, line_no: 5, shabad_id: 1, gurmukhi: "ਸੋਚੈ ਸੋਚਿ ਨ ਹੋਵਈ ਜੇ ਸੋਚੀ ਲਖ ਵਾਰ" },
      { verse_id: 9, ang: 1, line_no: 9, shabad_id: 1, gurmukhi: "ਕਿਵ ਸਚਿਆਰਾ ਹੋਈਐ ਕਿਵ ਕੂੜੈ ਤੁਟੈ ਪਾਲਿ" },
    ]).sql
  );
  await applyFrom(db, M);
}, 120_000);

const insert = (verse: number, kind: string, text: string) =>
  db.query(`insert into padarth_commentary (line_id, kind, body_text, chosen_by) values (${lineId(verse)}, '${kind}', '${text}', 'curator')`);

describe("086 padarth_commentary", () => {
  it("stores an introduction and a question, with the builder's author and review columns", async () => {
    await insert(5, "introduction", "Purity, silence and plenty cannot bring one to the Truth.");
    await insert(9, "question", "How, then, does one become truthful?");
    const rows = (
      await db.query<{ kind: string; provenance: string; review_status: string }>(
        `select kind, provenance, review_status from padarth_commentary order by line_id, kind`
      )
    ).rows;
    expect(rows).toEqual([
      { kind: "introduction", provenance: "human_verified", review_status: "unreviewed" },
      { kind: "question", provenance: "human_verified", review_status: "unreviewed" },
    ]);
  });

  it("keeps one of each kind per line", async () => {
    await expect(insert(5, "introduction", "again")).rejects.toThrow(/unique|duplicate/);
    await expect(insert(5, "question", "A question on the same line is fine.")).resolves.toBeDefined();
  });

  it("refuses an unknown kind and blank text", async () => {
    await expect(insert(9, "aside", "x")).rejects.toThrow(/check/);
    await expect(insert(9, "introduction", "  ")).rejects.toThrow(/check/);
  });

  it("refuses to delete a line that has commentary", async () => {
    await expect(db.query(`delete from lines where verse_id = 9`)).rejects.toThrow(/foreign key/);
  });

  it("touches updated_at on edit", async () => {
    await db.exec(`alter table padarth_commentary disable trigger padarth_commentary_touch`);
    await db.exec(`update padarth_commentary set updated_at = now() - interval '1 day' where kind = 'question' and line_id = ${lineId(9)}`);
    await db.exec(`alter table padarth_commentary enable trigger padarth_commentary_touch`);
    await db.exec(`update padarth_commentary set body_text = 'How is the wall of falsehood torn down?' where kind = 'question' and line_id = ${lineId(9)}`);
    const { fresh } = (
      await db.query<{ fresh: boolean }>(`select updated_at > now() - interval '1 minute' as fresh from padarth_commentary where kind = 'question' and line_id = ${lineId(9)}`)
    ).rows[0];
    expect(fresh).toBe(true);
  });

  it.each(["anon", "authenticated"])("is hidden from %s", async (role) => {
    await db.exec(`set role ${role}`);
    try {
      await expect(db.query(`select 1 from padarth_commentary`)).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });
});
