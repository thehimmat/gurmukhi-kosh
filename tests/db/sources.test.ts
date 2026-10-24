/**
 * Migration 065 (#243): sources carry their own reading order and metadata, so a new source is one
 * `insert into sources` with no migration touching the search functions.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { applyFrom, freshDb } from "./replay";
import { linesLoadSql, type LoadLine } from "../../pipeline/shared/load-sql";

const M = "065_data_driven_sources.sql";
// Building a migrated template takes several seconds; clones after that are fast.
const BUILD = 60_000;
beforeAll(() => freshDb().then(() => undefined), BUILD);
const line = (verse_id: number, shabad_id: number | null = null): LoadLine =>
  ({ verse_id, ang: 1, line_no: verse_id, shabad_id, gurmukhi: "ਸਤਿ ਨਾਮੁ" });
const load = (db: PGlite, code: string, lines: LoadLine[]) => db.exec(linesLoadSql(code, lines).sql);
const order = async (db: PGlite) =>
  (await db.query<{ slug: string }>(
    "select s.slug from lines l join sources s on s.id = l.source_fk order by l.corpus_rank, l.verse_id",
  )).rows.map((r) => r.slug);

describe("065: sources metadata", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await freshDb();
  });

  it("backfills every source", async () => {
    const { rows } = await db.query(
      `select code, slug, kind, tier, rank, page_unit, searched_by_default, external_refs
         from sources order by rank`,
    );
    expect(rows).toEqual([
      { code: "sggs_banidb_v2", slug: "sggs", kind: "scripture", tier: "gurbani", rank: 0, page_unit: "Ang",
        searched_by_default: true, external_refs: { banidb: "G", shabados: "SGGS" } },
      { code: "dasam_banidb_v2", slug: "dasam", kind: "scripture", tier: "gurbani", rank: 10, page_unit: "Ang",
        searched_by_default: true, external_refs: { banidb: "D", shabados: "SDGR" } },
      { code: "sarbloh_budha_dal", slug: "sarbloh", kind: "scripture", tier: "gurbani", rank: 20, page_unit: "Ang",
        searched_by_default: false, external_refs: { shabados: "SRBL" } },
      { code: "bhai_gurdas_banidb_v2", slug: "bhai-gurdas-vaaran", kind: "poetry", tier: "historical", rank: 30,
        page_unit: "Vaar", searched_by_default: false, external_refs: { banidb: "B", shabados: "VBGJ" } },
      { code: "gurdas_singh_vaar_2008", slug: "gurdas-singh-vaar", kind: "poetry", tier: "historical", rank: 35,
        page_unit: "Page", searched_by_default: false, external_refs: { banidb: "S" } },
      { code: "nand_lal_ghazals", slug: "nand-lal-ghazals", kind: "poetry", tier: "historical", rank: 40,
        page_unit: "Ghazal", searched_by_default: false, external_refs: { banidb: "N", shabados: "GZNL" } },
      { code: "gur_sobha_iss", slug: "gur-sobha", kind: "poetry", tier: "historical", rank: 50,
        page_unit: "Page", searched_by_default: false, external_refs: {} },
    ]);
  });

  it("requires a unique slug and a known kind and tier", async () => {
    const add = (slug: string, kind = "poetry", tier = "historical") =>
      db.exec(`insert into sources (code, name, slug, kind, tier) values ('x_${slug}', 'X', '${slug}', '${kind}', '${tier}')`);
    await expect(add("sggs")).rejects.toThrow(/unique/);
    await expect(add("a", "novel")).rejects.toThrow(/check/);
    await expect(add("b", "poetry", "modern")).rejects.toThrow(/check/);
    await expect(db.exec("insert into sources (code, name) values ('no_slug', 'X')")).rejects.toThrow(/null/);
  });
});

describe("065: corpus_rank follows sources.rank", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await freshDb();
    for (const code of ["nand_lal_ghazals", "bhai_gurdas_banidb_v2", "sarbloh_budha_dal", "dasam_banidb_v2", "sggs_banidb_v2"]) {
      await load(db, code, [line(1)]);
    }
  });

  it("ranks new lines by their source", async () => {
    expect(await order(db)).toEqual(["sggs", "dasam", "sarbloh", "bhai-gurdas-vaaran", "nand-lal-ghazals"]);
  });

  it("places a new source by its rank alone", async () => {
    await db.exec(`insert into sources (code, name, slug, kind, tier, rank)
                   values ('kabit_bhai_gurdas', 'Kabit Savaiye', 'kabit-savaiye', 'poetry', 'historical', 35)`);
    await load(db, "kabit_bhai_gurdas", [line(1)]);
    expect(await order(db)).toEqual(["sggs", "dasam", "sarbloh", "bhai-gurdas-vaaran", "kabit-savaiye", "nand-lal-ghazals"]);
  });

  it("puts an unranked source last", async () => {
    await db.exec(`insert into sources (code, name, slug, kind, tier)
                   values ('later', 'Later', 'later', 'poetry', 'historical')`);
    await load(db, "later", [line(1)]);
    expect((await order(db)).at(-1)).toBe("later");
  });

  it("re-ranks a source's lines when its rank changes", async () => {
    await db.exec("update sources set rank = 5 where slug = 'nand-lal-ghazals'");
    expect(await order(db)).toEqual(["sggs", "nand-lal-ghazals", "dasam", "sarbloh", "bhai-gurdas-vaaran"]);
  });

  it("ignores a corpus_rank written directly", async () => {
    await db.exec("update lines set corpus_rank = 999 where source_fk = (select id from sources where slug = 'sggs')");
    expect((await order(db))[0]).toBe("sggs");
  });
});

describe("065: shabads.source_fk", () => {
  it("references sources, backfilled from each shabad's lines", async () => {
    const db = await freshDb({ before: M });
    // 063 seeds the ghazals' shabads (30000-30062); the others are added here.
    await db.exec(`insert into shabads (id, ang_start) values (40001, 1), (99, 1)`);
    await load(db, "nand_lal_ghazals", [line(1, 30000)]);
    await load(db, "bhai_gurdas_banidb_v2", [line(1, 40001)]);
    await applyFrom(db, M);

    const { rows } = await db.query<{ id: number; slug: string | null }>(
      `select sh.id, s.slug from shabads sh left join sources s on s.id = sh.source_fk
        where sh.id in (99, 30000, 40001) order by sh.id`,
    );
    // A shabad no line uses keeps the old default, which is SGGS's id.
    expect(rows).toEqual([
      { id: 99, slug: "sggs" },
      { id: 30000, slug: "nand-lal-ghazals" },
      { id: 40001, slug: "bhai-gurdas-vaaran" },
    ]);
    await expect(db.exec("update shabads set source_fk = 5 where id = 99")).rejects.toThrow(/foreign key/);
  }, BUILD);
});
