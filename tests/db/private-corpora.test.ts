/**
 * Migration 070: a corpus source is public only when its code is public in source_rights (069). A
 * private corpus's lines and everything that points at them are invisible to the API roles (anon,
 * authenticated), and counts derived from the corpus leave it out. service_role (the curator) still
 * sees it all.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb } from "./replay";
import { linesLoadSql, type LoadLine } from "../../pipeline/shared/load-sql";

const PRIVATE = "test_private";
const SGGS_SHABAD = 1;
const PRIVATE_SHABAD = 990001;

// ਸਤਿ is in both sources; ਗੁਪਤੁ and ਬਚਨੁ only in the private one.
const publicLines: LoadLine[] = [
  { verse_id: 1, ang: 1, line_no: 1, shabad_id: SGGS_SHABAD, gurmukhi: "ਸਤਿ ਨਾਮੁ ਕਰਤਾ ॥" },
  { verse_id: 2, ang: 1, line_no: 2, shabad_id: SGGS_SHABAD, gurmukhi: "ਗੁਰ ਪ੍ਰਸਾਦਿ ॥੧॥" },
];
const privateLines: LoadLine[] = [
  { verse_id: 1, ang: 2, line_no: 1, shabad_id: PRIVATE_SHABAD, gurmukhi: "ਸਤਿ ਗੁਪਤੁ ਬਚਨੁ ॥੧॥" },
];

async function seed(db: PGlite) {
  await db.exec(`
    insert into sources (code, name, version, description, slug, kind, tier, rank)
    values ('${PRIVATE}', 'Private test source', 'v1', 'test', 'test-private', 'poetry', 'historical', 90);
    insert into source_rights (code, visibility, rights_status) values ('${PRIVATE}', 'curator', 'pending');
    insert into shabads (id, writer_id, writer_english, ang_start, source_fk) values
      (${SGGS_SHABAD}, 1, 'Guru Nanak Dev Ji', 1, (select id from sources where code = 'sggs_banidb_v2')),
      (${PRIVATE_SHABAD}, 999, 'Kavi Sainapati', 2, (select id from sources where code = '${PRIVATE}'));
  `);
  await db.exec(linesLoadSql("sggs_banidb_v2", publicLines).sql);
  await db.exec(linesLoadSql(PRIVATE, privateLines).sql);
  const privateLine = `(select l.id from lines l join sources s on s.id = l.source_fk where s.code = '${PRIVATE}')`;
  await db.exec(`
    insert into translation_sources (code, name, language) values ('test', 'Test translation', 'en')
      on conflict (code) do nothing;
    -- a public translation source: its row on the private line is hidden by the line, not by 069
    insert into source_rights (code, visibility, rights_status) values ('test', 'public', 'own');
    insert into line_translations (line_id, source_code, language, body_unicode)
      values (${privateLine}, 'test', 'en', 'a hidden translation');
    insert into number_occurrences (line_id, value, role, char_start, char_end)
      values (${privateLine}, 1, 'verse_marker', 0, 1);
    select refresh_word_frequencies();
    select refresh_word_corpus_stats();
    select refresh_word_corpus_writer_stats();
    select refresh_line_first_letters();
    refresh materialized view word_writer_stats;
  `);
}

let db: PGlite;
beforeAll(async () => {
  db = await freshDb();
  await seed(db);
}, 120_000);

const asRole = async <T>(role: string, f: () => Promise<T>): Promise<T> => {
  await db.exec(`set role ${role}`);
  try {
    return await f();
  } finally {
    await db.exec("reset role");
  }
};
const anon = <T>(f: () => Promise<T>) => asRole("anon", f);
const col = async <T>(sql: string, params: unknown[] = []) =>
  (await db.query<{ v: T }>(sql, params)).rows.map((r) => r.v);

describe("070: private corpora are hidden from the API roles", () => {
  it("hides the source itself", async () => {
    expect(await anon(() => col("select code as v from sources where code = $1", [PRIVATE]))).toEqual([]);
    expect(await anon(() => col("select code as v from sources where code = 'sggs_banidb_v2'"))).toEqual(["sggs_banidb_v2"]);
  });

  it("hides its lines, shabads, occurrences, translations and numbers", async () => {
    await anon(async () => {
      expect(await col("select gurmukhi as v from lines order by id")).toEqual(publicLines.map((l) => l.gurmukhi));
      expect(await col("select id as v from shabads where id in ($1, $2) order by id", [SGGS_SHABAD, PRIVATE_SHABAD]))
        .toEqual([SGGS_SHABAD]);
      expect(await col("select count(*)::int as v from word_occurrences o join words w on w.id = o.word_id where w.gurmukhi = 'ਗੁਪਤੁ'"))
        .toEqual([0]);
      expect(await col("select count(*)::int as v from line_translations")).toEqual([0]);
      expect(await col("select count(*)::int as v from number_occurrences")).toEqual([0]);
    });
  });

  it("leaves it out of every line search, even when asked for by id", async () => {
    const privateId = (await col<number>("select id as v from sources where code = $1", [PRIVATE]))[0];
    await anon(async () => {
      expect(await col("select gurmukhi as v from search_lines_contains('ਸਤਿ')")).toEqual([publicLines[0].gurmukhi]);
      expect(await col("select count_lines_contains('ਸਤਿ')::int as v")).toEqual([1]);
      expect(await col("select gurmukhi as v from search_lines_contains('ਸਤਿ', null, null, $1)", [[privateId]])).toEqual([]);
      expect(await col("select gurmukhi as v from search_lines_regex('ਗੁਪਤੁ', null::text[], null::text[], null::bigint[])")).toEqual([]);
      expect(await col("select gurmukhi as v from search_lines_fuzzy('ਗੁਪਤੁ', 1)")).toEqual([]);
      expect(await col("select gurmukhi as v from search_first_letters(array['ਸ','ਗ','ਬ'], null::text[], null::text[], null::bigint[])")).toEqual([]);
      const ids = await col<number>("select id as v from words where gurmukhi in ('ਸਤਿ', 'ਗੁਪਤੁ')");
      expect(await col("select gurmukhi as v from search_lines_by_word_ids($1, null::text[], null::text[], null::bigint[])", [ids]))
        .toEqual([publicLines[0].gurmukhi]);
    });
  });

  it("leaves it out of the fuzzy, number and legacy single-value searches too", async () => {
    await anon(async () => {
      expect(await col("select count_lines_fuzzy('ਗੁਪਤੁ', 1)::int as v")).toEqual([0]);
      expect(await col("select gurmukhi as v from search_first_letters_fuzzy(array['ਸ','ਗ','ਬ'], 1)")).toEqual([]);
      expect(await col("select gurmukhi as v from search_number_lines(1)")).toEqual([]);
      expect(await col("select count(*)::int as v from count_number_roles(1) where line_count > 0")).toEqual([0]);
      expect(await col("select gurmukhi as v from search_lines_regex('ਗੁਪਤੁ', null::text, null::text)")).toEqual([]);
      expect(await col("select gurmukhi as v from search_first_letters(array['ਸ','ਗ','ਬ'], null::text, null::text)")).toEqual([]);
    });
  });

  it("keeps the line searches on their indexes: as definer, they filter is_public themselves", async () => {
    const reads = "pg_get_functiondef(p.oid) ~ '\\m(from|join)\\s+(lines|number_occurrences)\\M'";
    const fns = (where: string) => col<string>(
      `select p.oid::regprocedure::text as v from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname ~ '^(search_|count_|list_number)' and ${where} order by 1`,
    );
    // A definer function bypasses RLS, so it must read the public-only subqueries instead.
    expect(await fns(`p.prosecdef and ${reads}`)).toEqual([]);
    // The ten line searches are definer; what still reads a table directly runs under RLS.
    expect((await fns("p.prosecdef")).length).toBeGreaterThanOrEqual(10);
    expect(await fns(`not p.prosecdef and ${reads}`)).toEqual(["list_number_roles(integer)"]);
    expect(await anon(() => col("select coalesce(sum(line_count), 0)::int as v from list_number_roles(1)"))).toEqual([0]);
  });

  it("leaves it out of the facet lists", async () => {
    await anon(async () => {
      expect(await col("select code as v from list_corpora()")).not.toContain(PRIVATE);
      expect(await col("select writer_english as v from list_writers()")).not.toContain("Kavi Sainapati");
    });
  });

  it("counts words from public sources only", async () => {
    await anon(async () => {
      expect(await col("select frequency as v from words where gurmukhi = 'ਸਤਿ'")).toEqual([1]);
      expect(await col("select frequency as v from words where gurmukhi = 'ਗੁਪਤੁ'")).toEqual([0]);
      expect(await col("select in_corpus as v from words where gurmukhi = 'ਗੁਪਤੁ'")).toEqual([false]);
      expect(await col("select count(*)::int as v from word_corpus_stats s join words w on w.id = s.word_id where w.gurmukhi = 'ਸਤਿ'"))
        .toEqual([1]);
      expect(await col("select count(*)::int as v from word_corpus_writer_stats where writer_english = 'Kavi Sainapati'")).toEqual([0]);
      expect(await col("select count(*)::int as v from word_writer_stats where writer_english = 'Kavi Sainapati'")).toEqual([0]);
    });
  });

  it("leaves it out of the public health totals", async () => {
    const stats = await anon(() => col<Record<string, number>>("select health_stats() as v"));
    expect(stats[0].total_lines).toBe(publicLines.length);
    expect(stats[0].total_occurrences).toBe(5); // ਸਤਿ ਨਾਮੁ ਕਰਤਾ, ਗੁਰ ਪ੍ਰਸਾਦਿ
    expect(stats[0].total_angs).toBe(1); // the private line is alone on ang 2
    expect(stats[0].lines_with_no_commentary).toBe(2);
    expect(stats[0].lines_per_source).toEqual([]); // the one translation is on the private line
  });

  it("counts the health totals without reading every line (072)", async () => {
    // health_stats subtracts the private lines, found through this partial index, from totals
    // over all lines; filtering on is_public instead read the whole table (5.8 s for the angs).
    expect(await col("select indexdef as v from pg_indexes where indexname = 'lines_private'"))
      .toEqual([expect.stringMatching(/WHERE \(NOT is_public\)/)]);
    const def = (await col<string>("select pg_get_functiondef('health_stats()'::regprocedure) as v"))[0];
    expect(def).not.toMatch(/from lines where is_public/);
  });

  it("lets only the service role refresh the computed views", async () => {
    await expect(anon(() => db.query("select refresh_computed_stats()"))).rejects.toThrow(/permission denied/);
  });

  it("still lets the service role refresh them", async () => {
    await asRole("service_role", () => db.query("select refresh_computed_stats()"));
  });

  it("shows the service role everything", async () => {
    await asRole("service_role", async () => {
      expect(await col("select count(*)::int as v from lines")).toEqual([3]);
      expect(await col("select code as v from sources where code = $1", [PRIVATE])).toEqual([PRIVATE]);
    });
  });
});

describe("070: publishing a corpus", () => {
  it("shows its lines once visibility changes", async () => {
    const fresh = await freshDb();
    await seed(fresh);
    await fresh.exec(`update source_rights set visibility = 'public', rights_status = 'permitted' where code = '${PRIVATE}'`);
    await fresh.exec("set role anon");
    const rows = await fresh.query<{ n: number }>("select count(*)::int as n from lines");
    expect(rows.rows[0].n).toBe(3);
  });

  it("keeps the corpora loaded so far public", async () => {
    const fresh = await freshDb();
    const { rows } = await fresh.query<{ code: string; visibility: string }>(
      `select s.code, r.visibility from sources s left join source_rights r on r.code = s.code order by s.rank`,
    );
    expect(rows).toEqual([
      { code: "sggs_banidb_v2", visibility: "public" },
      { code: "dasam_banidb_v2", visibility: "public" },
      { code: "sarbloh_budha_dal", visibility: "public" },
      { code: "bhai_gurdas_banidb_v2", visibility: "public" },
      { code: "gurdas_singh_vaar_2008", visibility: "curator" },
      { code: "nand_lal_ghazals", visibility: "public" },
      { code: "gur_sobha_iss", visibility: "curator" },
    ]);
  });

  it("hides a corpus again when its rights row goes", async () => {
    const fresh = await freshDb();
    await seed(fresh);
    await fresh.exec(`update source_rights set visibility = 'public' where code = '${PRIVATE}'`);
    await fresh.exec(`delete from source_rights where code = '${PRIVATE}'`);
    await fresh.exec("set role anon");
    expect((await fresh.query<{ n: number }>("select count(*)::int as n from lines")).rows[0].n).toBe(2);
  });
});
