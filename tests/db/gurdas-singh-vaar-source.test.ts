/**
 * Migration 075: Bhai Gurdas Singh's vaar (the 2008 GurbaniLipi typed text) as a curator-only corpus
 * (source_rights 069, corpora 070), with one shabad per pauri. Who holds the rights to the typing is
 * unknown, so it stays hidden from the public until that is settled.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb } from "./replay";
import { linesLoadSql } from "../../pipeline/shared/load-sql";

const CODE = "gurdas_singh_vaar_2008";
// the work's first rows, as the build writes them
const FIRST = [
  { verse_id: 1, ang: 1, line_no: 1, shabad_id: 930001, gurmukhi: "ੴ ਸਤਿਗੁਰਪ੍ਰਸਾਦਿ ॥" },
  { verse_id: 2, ang: 1, line_no: 2, shabad_id: 930001, gurmukhi: "ਹਰਿ ਸਚੇ ਤਖਤ ਰਚਾਇਆ ਸਤਿ ਸੰਗਤਿ ਮੇਲਾ ॥" },
];

let db: PGlite;
beforeAll(async () => {
  db = await freshDb();
  await db.exec(linesLoadSql(CODE, FIRST).sql);
}, 120_000);

const one = async <T>(sql: string) => (await db.query<{ v: T }>(sql)).rows[0]?.v;

describe("075: Bhai Gurdas Singh's vaar", () => {
  it("is a curator-only historical source read after Bhai Gurdas's vaars", async () => {
    const s = (await db.query<Record<string, unknown>>(
      `select s.id::int, s.slug, s.kind, s.tier, s.rank, s.page_unit, s.searched_by_default, s.author, s.external_refs,
              r.visibility, r.rights_status
         from sources s join source_rights r on r.code = s.code where s.code = '${CODE}'`,
    )).rows[0];
    expect(s).toEqual({ id: 8, slug: "gurdas-singh-vaar", kind: "poetry", tier: "historical", rank: 35,
      page_unit: "Page", searched_by_default: false, author: "Bhai Gurdas Singh Ji", external_refs: { banidb: "S" },
      visibility: "curator", rights_status: "pending" });
  });

  it("has a shabad for each of the 28 pauris, by Bhai Gurdas Singh Ji (BaniDB writer 49)", async () => {
    expect(await one<number>(
      `select count(*)::int as v from shabads s join sources src on src.id = s.source_fk
        where src.code = '${CODE}' and s.writer_english = 'Bhai Gurdas Singh Ji' and s.writer_id = 49`,
    )).toBe(28);
    expect(await one<string>("select min(id) || '-' || max(id) as v from shabads where id between 930000 and 939999"))
      .toBe("930001-930028");
    expect(await one<number>("select ang_start as v from shabads where id = 930028")).toBe(15);
  });

  it("is hidden from the public, lines, shabads and words alike", async () => {
    await db.exec("set role anon");
    try {
      expect(await one<number>(`select count(*)::int as v from sources where code = '${CODE}'`)).toBe(0);
      expect(await one<number>("select count(*)::int as v from shabads where id between 930001 and 930028")).toBe(0);
      expect(await one<number>("select count(*)::int as v from lines where shabad_id = 930001")).toBe(0);
      expect(await one<number>("select count(*)::int as v from search_lines_contains('ਤਖਤ ਰਚਾਇਆ')")).toBe(0);
    } finally {
      await db.exec("reset role");
    }
  });

  it("shows once published", async () => {
    const fresh = await freshDb();
    await fresh.exec(linesLoadSql(CODE, FIRST).sql);
    await fresh.exec(`update source_rights set visibility = 'public', rights_status = 'permitted' where code = '${CODE}'`);
    await fresh.exec("set role anon");
    expect((await fresh.query<{ n: number }>("select count(*)::int as n from search_lines_contains('ਤਖਤ ਰਚਾਇਆ')")).rows[0].n)
      .toBe(1);
  });
});
