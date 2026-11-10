/**
 * Migration 090: Monier-Williams 1899 from Cologne's csl-orig as a dictionary source, curator-only
 * until the Kosh settles how it carries CC BY-SA 4.0 data (plan Phase 1, #249, #273).
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb } from "./replay";
import { dictEntriesLoadSql } from "../../pipeline/shared/dict-entries";
import { parseCsl } from "../../pipeline/cologne/parse";
import { cologneEntries } from "../../pipeline/cologne/entries";

const SAMPLE = [
  "<L>2<pc>1,1<k1>akAra<k2>a—kAra<e>3",
  "<s>a—kAra</s> ¦ <lex>m.</lex> the letter or sound <s>a</s>.",
  "<LEND>",
].join("\n");

let db: PGlite;

const asRole = async <T,>(role: string, d: PGlite, sql: string): Promise<T[]> => {
  await d.exec(`set role ${role}`);
  try {
    return (await d.query<T>(sql)).rows;
  } finally {
    await d.exec("reset role");
  }
};
beforeAll(async () => {
  db = await freshDb();
  for (const s of dictEntriesLoadSql("cologne_mw", cologneEntries("cologne_mw", parseCsl(SAMPLE))).statements) await db.exec(s);
}, 120_000);

describe("090: Monier-Williams (Cologne)", () => {
  it("is a Sanskrit dictionary source, open-licensed but curator-only for now", async () => {
    const { rows } = await db.query(
      `select d.language, r.visibility, r.rights_status, r.licence
         from dict_sources d join source_rights r on r.code = d.code where d.code = 'cologne_mw'`,
    );
    expect(rows).toEqual([{ language: "sa", visibility: "curator", rights_status: "open", licence: "CC BY-SA 4.0" }]);
  });

  it("loads entries the public can't see yet", async () => {
    const { rows } = await db.query("select entry_ref from dict_entries");
    expect(rows).toEqual([{ entry_ref: "cologne_mw:L2" }]);
    expect(await asRole("anon", db, "select entry_ref from dict_entries")).toEqual([]);
  });
});
