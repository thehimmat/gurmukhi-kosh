/**
 * Migration 071: Sri Gur Sobha (ISS 2014 edition) as a curator-only corpus (source_rights 069,
 * corpora 070), with its shabads. The typed text belongs to the edition, so it stays hidden from the
 * public until permission is settled.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb } from "./replay";
import { linesLoadSql } from "../../pipeline/shared/load-sql";
import { wordText } from "../../pipeline/gur-sobha/lines";

let db: PGlite;
beforeAll(async () => {
  db = await freshDb();
  // the work's first rows, as the build writes them
  await db.exec(linesLoadSql("gur_sobha_iss", [
    { verse_id: 1, ang: 2, line_no: 1, shabad_id: 920001, gurmukhi: "ੴ ਸ੍ਰੀ ਵਾਹਗੁਰੂ ਜੀ ਕੀ ਫਤਹਿ ॥" },
    { verse_id: 2, ang: 2, line_no: 2, shabad_id: 920001, gurmukhi: "ਸ੍ਰੀ ਗੁਰੁ ਸੋਭਾ ਗ੍ਰੰਥ ਲਿਖਯਤੇ ॥" },
  ], wordText).sql);
}, 120_000);

const one = async <T>(sql: string) => (await db.query<{ v: T }>(sql)).rows[0]?.v;

describe("071: Sri Gur Sobha", () => {
  it("is a curator-only historical source read after Bhai Nand Lal", async () => {
    const s = (await db.query<Record<string, unknown>>(
      `select s.slug, s.kind, s.tier, s.rank, s.page_unit, s.searched_by_default, r.visibility, r.rights_status
         from sources s join source_rights r on r.code = s.code where s.code = 'gur_sobha_iss'`,
    )).rows[0];
    expect(s).toEqual({ slug: "gur-sobha", kind: "poetry", tier: "historical", rank: 50, page_unit: "Page",
      searched_by_default: false, visibility: "curator", rights_status: "pending" });
  });

  it("has a shabad for each of the build's 483 sections, by Kavi Sainapati", async () => {
    expect(await one<number>("select count(*)::int as v from shabads where id between 920001 and 920483 and writer_english = 'Kavi Sainapati'"))
      .toBe(483);
    expect(await one<number>("select count(*)::int as v from shabads s join sources src on src.id = s.source_fk where src.code = 'gur_sobha_iss'"))
      .toBe(483);
  });

  it("is hidden from the public, lines, shabads and words alike", async () => {
    await db.exec("set role anon");
    try {
      expect(await one<number>("select count(*)::int as v from sources where code = 'gur_sobha_iss'")).toBe(0);
      expect(await one<number>("select count(*)::int as v from shabads where id between 920001 and 920483")).toBe(0);
      expect(await one<number>("select count(*)::int as v from lines where shabad_id = 920001")).toBe(0);
      expect(await one<number>("select count(*)::int as v from search_lines_contains('ਲਿਖਯਤੇ')")).toBe(0);
    } finally {
      await db.exec("reset role");
    }
  });

  it("shows once published", async () => {
    const fresh = await freshDb();
    await fresh.exec(linesLoadSql("gur_sobha_iss", [
      { verse_id: 1, ang: 2, line_no: 1, shabad_id: 920001, gurmukhi: "ਸ੍ਰੀ ਗੁਰੁ ਸੋਭਾ ਗ੍ਰੰਥ ਲਿਖਯਤੇ ॥" },
    ], wordText).sql);
    await fresh.exec("update source_rights set visibility = 'public', rights_status = 'permitted' where code = 'gur_sobha_iss'");
    await fresh.exec("set role anon");
    expect((await fresh.query<{ n: number }>("select count(*)::int as n from search_lines_contains('ਲਿਖਯਤੇ')")).rows[0].n).toBe(1);
  });
});
