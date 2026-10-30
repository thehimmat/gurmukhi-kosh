/**
 * Migration 080: the /health commentary metrics count Guru Granth Sahib lines only. The commentaries
 * (line_translations) cover SGGS alone, so counting every corpus put every Dasam, Bhai Gurdas, Sarbloh
 * … line under "zero commentary" (112,229 on 2026-10-29, against the ~55 non-content SGGS lines the
 * metric watches for) and divided coverage by all lines.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb } from "./replay";
import { linesLoadSql, type LoadLine } from "../../pipeline/shared/load-sql";

const OTHER = "test_other_public";

const line = (line_no: number, shabad_id: number, gurmukhi: string): LoadLine =>
  ({ verse_id: line_no, ang: 1, line_no, shabad_id, gurmukhi });

let db: PGlite;
beforeAll(async () => {
  db = await freshDb();
  await db.exec(`
    insert into sources (code, name, version, description, slug, kind, tier, rank)
    values ('${OTHER}', 'Other public source', 'v1', 'test', 'test-other', 'poetry', 'historical', 90);
    insert into source_rights (code, visibility, rights_status) values ('${OTHER}', 'public', 'own');
    insert into shabads (id, writer_id, writer_english, ang_start, source_fk) values
      (1, 1, 'Guru Nanak Dev Ji', 1, (select id from sources where code = 'sggs_banidb_v2')),
      (990001, 47, 'Guru Gobind Singh Ji', 1, (select id from sources where code = '${OTHER}'));
  `);
  await db.exec(linesLoadSql("sggs_banidb_v2", [line(1, 1, "ਸਤਿ ਨਾਮੁ ॥"), line(2, 1, "ਗੁਰ ਪ੍ਰਸਾਦਿ ॥")]).sql);
  await db.exec(linesLoadSql(OTHER, [line(1, 990001, "ਅਕਾਲ ਪੁਰਖ ॥"), line(2, 990001, "ਸਰਬ ਲੋਹ ॥")]).sql);
  await db.exec(`
    insert into translation_sources (code, name, language) values ('test', 'Test translation', 'en')
      on conflict (code) do nothing;
    insert into source_rights (code, visibility, rights_status) values ('test', 'public', 'own')
      on conflict (code) do nothing;
    insert into line_translations (line_id, source_code, language, body_unicode)
      select l.id, 'test', 'en', 'a translation' from lines l join sources s on s.id = l.source_fk
       where s.code = 'sggs_banidb_v2' and l.verse_id = 1;
  `);
  await db.exec("set role service_role; select refresh_health_stats(); reset role;");
}, 120_000);

const stats = async () => {
  await db.exec("set role anon");
  try {
    return (await db.query<{ v: Record<string, unknown> }>("select health_stats() as v")).rows[0].v;
  } finally {
    await db.exec("reset role");
  }
};

describe("080: the commentary metrics count Guru Granth Sahib lines only", () => {
  it("counts only SGGS lines with no commentary, not other corpora's", async () => {
    const s = await stats();
    expect(s.total_lines).toBe(4);
    expect(s.lines_with_no_commentary).toBe(1);
  });

  it("gives the SGGS line count for commentary coverage", async () => {
    const s = await stats();
    expect(s.sggs_lines).toBe(2);
    expect(s.lines_per_source).toEqual([{ source_code: "test", rows: 1, lines: 1 }]);
  });
});
