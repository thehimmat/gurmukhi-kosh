/**
 * The migrations replayed into an in-process Postgres (PGlite) in server-ledger order, so schema
 * changes can be tested before they reach the live project. No credentials needed.
 */
import { readdirSync } from "node:fs";
import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb, replayOrder } from "./replay";
import { linesLoadSql } from "../../pipeline/shared/load-sql";

const sqlFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sqlFiles(`${dir}/${e.name}`) : e.name.endsWith(".sql") ? [`${dir}/${e.name}`] : [],
  );

describe("replayOrder", () => {
  it("replays every migration file exactly once", () => {
    const order = replayOrder();
    expect(new Set(order).size).toBe(order.length);
    expect([...order].sort()).toEqual(
      [...sqlFiles("supabase/migrations"), ...sqlFiles("supabase/migrations-imported")].sort(),
    );
  });

  it("keeps this repo's migrations in number order", () => {
    const kosh = replayOrder().filter((f) => f.startsWith("supabase/migrations/"));
    expect(kosh).toEqual([...kosh].sort());
  });

  it("puts sibling migrations where the server ledger has them", () => {
    const order = replayOrder();
    const at = (name: string) => order.findIndex((f) => f.endsWith(name));
    expect(at("gurmukhi-voice-search/001_add_phonetic_ipa.sql")).toBeLessThan(at("004_pronunciation_audio.sql"));
    expect(at("gurmukhi-search/007_single_value_rpc_compat.sql")).toBeLessThan(at("032_number_occurrences.sql"));
    expect(at("gurmukhi-search/007_single_value_rpc_compat.sql")).toBeGreaterThan(at("031_lines_corpus_rank.sql"));
  });
});

describe("the replayed schema", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await freshDb();
  }, 60_000); // the first call builds the migrated template

  it("gives the sources the ids they have in production", async () => {
    const { rows } = await db.query<{ id: number; code: string }>("select id::int, code from sources order by id");
    expect(rows).toEqual([
      { id: 1, code: "sggs_banidb_v2" },
      { id: 2, code: "bhai_gurdas_banidb_v2" },
      { id: 3, code: "dasam_banidb_v2" },
      { id: 4, code: "sarbloh_budha_dal" },
      { id: 6, code: "nand_lal_ghazals" },
      { id: 7, code: "gur_sobha_iss" },
      { id: 8, code: "gurdas_singh_vaar_2008" },
    ]);
  });

  it("orders lines SGGS, Dasam, Sarbloh, Bhai Gurdas, Nand Lal by corpus_rank", async () => {
    for (const code of ["nand_lal_ghazals", "bhai_gurdas_banidb_v2", "sarbloh_budha_dal", "dasam_banidb_v2", "sggs_banidb_v2"]) {
      await db.exec(linesLoadSql(code, [{ verse_id: 1, ang: 1, line_no: 1, shabad_id: null, gurmukhi: "ਸਤਿ ਨਾਮੁ" }]).sql);
    }
    const { rows } = await db.query<{ code: string }>(
      "select s.code from lines l join sources s on s.id = l.source_fk order by l.corpus_rank",
    );
    expect(rows.map((r) => r.code)).toEqual([
      "sggs_banidb_v2", "dasam_banidb_v2", "sarbloh_budha_dal", "bhai_gurdas_banidb_v2", "nand_lal_ghazals",
    ]);
  });

  it("lets anon read lines but not write them (RLS)", async () => {
    await db.exec("set role anon");
    try {
      const { rows } = await db.query<{ n: number }>("select count(*)::int as n from lines");
      expect(rows[0].n).toBeGreaterThan(0);
      await expect(
        db.exec("insert into lines (source_fk, verse_id, ang, line_no, gurmukhi) values (1, 99, 1, 1, 'ਹ')"),
      ).rejects.toThrow(/row-level security/);
    } finally {
      await db.exec("reset role");
    }
  });

  it("gives each caller its own copy", async () => {
    const other = await freshDb();
    const { rows } = await other.query<{ n: number }>("select count(*)::int as n from lines");
    expect(rows[0].n).toBe(0);
  });
});
