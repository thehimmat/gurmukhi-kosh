/**
 * Migration 077: Chandi Charitar II, as printed in a Punjabi-translated Sri Dasam Granth (pp. 131-157),
 * as a curator-only corpus (source_rights 069, corpora 070), with its 64 shabads. Who printed the
 * edition, and so who holds rights to its typing, is unknown, so it stays hidden until that is settled.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb } from "./replay";
import { linesLoadSql } from "../../pipeline/shared/load-sql";

const CODE = "chandi_charitar_2_dg";
// the work's first rows, as the build writes them
const FIRST = [
  { verse_id: 1, ang: 131, line_no: 1, shabad_id: 940001, gurmukhi: "ਸ੍ਰੀ ਭਗਉਤੀ ਜੀ ਸਹਾਇ ॥" },
  { verse_id: 4, ang: 131, line_no: 4, shabad_id: 940001, gurmukhi: "ਮਹਿਖ ਦਈਤ ਸੂਰਯੰ ॥" },
];

let db: PGlite;
beforeAll(async () => {
  db = await freshDb();
  await db.exec(linesLoadSql(CODE, FIRST).sql);
}, 120_000);

const one = async <T>(sql: string) => (await db.query<{ v: T }>(sql)).rows[0]?.v;

describe("077: Chandi Charitar II (Punjabi-translated Dasam Granth)", () => {
  it("is a curator-only Gurbani source read after the Dasam Granth", async () => {
    const s = (await db.query<Record<string, unknown>>(
      `select s.id::int, s.slug, s.kind, s.tier, s.rank, s.page_unit, s.searched_by_default, s.author, s.external_refs,
              r.visibility, r.rights_status
         from sources s join source_rights r on r.code = s.code where s.code = '${CODE}'`,
    )).rows[0];
    expect(s).toEqual({ id: 9, slug: "chandi-charitar-2", kind: "scripture", tier: "gurbani", rank: 15,
      page_unit: "Page", searched_by_default: false, author: "Guru Gobind Singh Ji", external_refs: { banidb: "D" },
      visibility: "curator", rights_status: "pending" });
  });

  it("has 64 shabads, by Guru Gobind Singh Ji (BaniDB writer 47), starting on their printed pages", async () => {
    expect(await one<number>(
      `select count(*)::int as v from shabads s join sources src on src.id = s.source_fk
        where src.code = '${CODE}' and s.writer_english = 'Guru Gobind Singh Ji' and s.writer_id = 47`,
    )).toBe(64);
    expect(await one<string>("select min(id) || '-' || max(id) as v from shabads where id between 940000 and 949999"))
      .toBe("940001-940064");
    expect(await one<number>("select ang_start as v from shabads where id = 940001")).toBe(131);
    expect(await one<number>("select ang_start as v from shabads where id = 940064")).toBe(157);
  });

  it("is hidden from the public, lines, shabads and words alike", async () => {
    await db.exec("set role anon");
    try {
      expect(await one<number>(`select count(*)::int as v from sources where code = '${CODE}'`)).toBe(0);
      expect(await one<number>("select count(*)::int as v from shabads where id between 940001 and 940064")).toBe(0);
      expect(await one<number>("select count(*)::int as v from lines where shabad_id = 940001")).toBe(0);
      expect(await one<number>("select count(*)::int as v from search_lines_contains('ਦਈਤ ਸੂਰਯੰ')")).toBe(0);
    } finally {
      await db.exec("reset role");
    }
  });

  it("shows once published", async () => {
    const fresh = await freshDb();
    await fresh.exec(linesLoadSql(CODE, FIRST).sql);
    await fresh.exec(`update source_rights set visibility = 'public', rights_status = 'permitted' where code = '${CODE}'`);
    await fresh.exec("set role anon");
    expect((await fresh.query<{ n: number }>("select count(*)::int as n from search_lines_contains('ਦਈਤ ਸੂਰਯੰ')")).rows[0].n)
      .toBe(1);
  });
});
