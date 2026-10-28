/**
 * Migration 075: health_stats() reads its slow totals from health_stats_cache, which
 * refresh_health_stats() rebuilds after an ingest. Only the counts a user can change (open flags) and
 * the source registries stay live. Before, the function scanned definitions and line_translations on
 * every /api/health load (~17 s on production, against a 20 s limit).
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb } from "./replay";
import { linesLoadSql, type LoadLine } from "../../pipeline/shared/load-sql";

const line = (line_no: number, gurmukhi: string): LoadLine =>
  ({ verse_id: line_no, ang: 1, line_no, shabad_id: 1, gurmukhi });

let db: PGlite;
beforeAll(async () => {
  db = await freshDb();
  await db.exec(`
    insert into shabads (id, writer_id, writer_english, ang_start, source_fk)
    values (1, 1, 'Guru Nanak Dev Ji', 1, (select id from sources where code = 'sggs_banidb_v2'));
  `);
  await db.exec(linesLoadSql("sggs_banidb_v2", [line(1, "ਸਤਿ ਨਾਮੁ ਕਰਤਾ ॥")]).sql);
}, 120_000);

type Stats = Record<string, unknown> & { total_lines: number; open_flags_total: number };

const asRole = async <T>(role: string, f: () => Promise<T>): Promise<T> => {
  await db.exec(`set role ${role}`);
  try {
    return await f();
  } finally {
    await db.exec("reset role");
  }
};
const stats = () => asRole("anon", async () => (await db.query<{ v: Stats }>("select health_stats() as v")).rows[0].v);
const refresh = () => asRole("service_role", () => db.query("select refresh_health_stats()"));
const fnDef = async (sig: string) =>
  (await db.query<{ v: string }>(`select pg_get_functiondef('${sig}'::regprocedure) as v`)).rows[0].v;

describe("075: health_stats reads its slow totals from a cache", () => {
  it("is filled by the migration, so health_stats answers before the first refresh", async () => {
    const s = await stats();
    expect(s.total_lines).toBe(0); // the cache predates the line loaded above
    expect(s.lines_per_source).toEqual([]);
    expect(typeof s.stats_computed_at).toBe("string");
    expect(typeof s.stats_age_seconds).toBe("number");
  });

  it("shows new lines only once refresh_health_stats runs", async () => {
    await refresh();
    const before = await stats();
    expect(before.total_lines).toBe(1);
    expect(before.total_occurrences).toBe(3);

    await db.exec(linesLoadSql("sggs_banidb_v2", [line(2, "ਗੁਰ ਪ੍ਰਸਾਦਿ ॥੧॥")]).sql);
    expect((await stats()).total_lines).toBe(1);

    await refresh();
    const after = await stats();
    expect(after.total_lines).toBe(2);
    expect(Date.parse(after.stats_computed_at as string)).toBeGreaterThanOrEqual(Date.parse(before.stats_computed_at as string));
  });

  it("counts open flags live", async () => {
    const open = (await stats()).open_flags_total;
    await db.exec(`insert into flags (word_id, message) select id, 'test flag' from words where gurmukhi = 'ਸਤਿ'`);
    const s = await stats();
    expect(s.open_flags_total).toBe(open + 1);
    expect(s.open_flags_by_type).toEqual([{ flag_type: "incorrect", rows: open + 1 }]);
  });

  it("is refreshed by refresh_computed_stats too", async () => {
    await db.exec(linesLoadSql("sggs_banidb_v2", [line(3, "ਆਦਿ ਸਚੁ ॥")]).sql);
    await asRole("service_role", () => db.query("select refresh_computed_stats()"));
    expect((await stats()).total_lines).toBe(3);
  });

  it("lets only the service role refresh it or read the cache table", async () => {
    for (const role of ["anon", "authenticated"]) {
      await expect(asRole(role, () => db.query("select refresh_health_stats()"))).rejects.toThrow(/permission denied/);
      await expect(asRole(role, () => db.query("select * from health_stats_cache"))).rejects.toThrow(/permission denied/);
    }
    const rls = await db.query<{ v: boolean }>("select relrowsecurity as v from pg_class where relname = 'health_stats_cache'");
    expect(rls.rows[0].v).toBe(true);
  });

  it("keeps the big-table scans out of health_stats", async () => {
    const def = await fnDef("health_stats()");
    expect(def).toMatch(/health_stats_cache/);
    expect(def).not.toMatch(/\b(from|join)\s+(lines|word_occurrences|line_translations|definitions|word_grammar|words|etymology)\b/);
    // 072's rule carries over to the refresh: no filter on is_public, which no index answers
    expect(await fnDef("refresh_health_stats()")).not.toMatch(/from lines where is_public/);
  });
});
