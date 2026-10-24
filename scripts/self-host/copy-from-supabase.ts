/**
 * Copies the public schema's rows from a Supabase project into a self-hosted Postgres whose schema
 * is already in place (bootstrap.sql + the migration replay), through the REST API alone: no
 * database password needed, only the service key. Prefer restoring the weekly encrypted dump
 * (setup.sh restore); this is the fallback when no dump is at hand, and how the trial was loaded.
 *
 *   SRC_URL=https://<ref>.supabase.co SRC_KEY=<service key> PGHOST=... PGUSER=postgres PGDATABASE=kosh \
 *     npx tsx scripts/self-host/copy-from-supabase.ts [table ...]
 *
 * PostgREST caps every read at 1,000 rows (lib/fetch-all-rows.ts), so each table is paged. Tables
 * keyed by one integer id are paged by keyset (id=gt.N), split into id ranges fetched in parallel;
 * others by offset on their primary key. Rows are written as NDJSON, then loaded with one psql
 * session per table: COPY into a jsonb staging table, then insert the columns both sides share.
 * Triggers and FK checks are off while loading (session_replication_role = replica), so tables load
 * in any order; derived tables and materialized views are rebuilt afterwards by the refresh
 * functions (setup.sh refresh).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, createWriteStream, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC_URL = process.env.SRC_URL ?? "";
const SRC_KEY = process.env.SRC_KEY ?? "";
const OUT = process.env.COPY_DIR ?? "/tmp/kosh-copy";
const PAGE = 1000;
const RANGE = 50_000; // ids per parallel job
const WORKERS = Number(process.env.COPY_WORKERS ?? 8);

if (!SRC_URL || !SRC_KEY) throw new Error("set SRC_URL and SRC_KEY (the source project's service key)");

function psql(sql: string): string {
  const r = spawnSync("psql", ["-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`psql: ${r.stderr}`);
  return r.stdout.trim();
}

async function get(path: string): Promise<unknown[]> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${SRC_URL}/rest/v1/${path}`, {
      headers: { apikey: SRC_KEY, Authorization: `Bearer ${SRC_KEY}` },
    });
    if (res.ok) return (await res.json()) as unknown[];
    if (attempt >= 5) throw new Error(`${path}: ${res.status} ${await res.text()}`);
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
}

type Table = { name: string; pk: string[] };
type Job = { table: string; file: string; pages: () => AsyncGenerator<unknown[]> };

// Base tables of the local public schema, with their primary keys.
function localTables(only: string[]): Table[] {
  const rows = psql(`
    select c.relname, coalesce((select string_agg(a.attname, ',' order by k.o)
      from pg_constraint p cross join lateral unnest(p.conkey) with ordinality k(n, o)
      join pg_attribute a on a.attrelid = p.conrelid and a.attnum = k.n
      where p.conrelid = c.oid and p.contype = 'p'), '')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' order by 1`);
  return rows
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [name, pk] = l.split("|");
      return { name, pk: pk ? pk.split(",") : [] };
    })
    .filter((t) => only.length === 0 || only.includes(t.name));
}

async function* keyset(table: string, lo: number, hi: number) {
  for (let after = lo; ; ) {
    const rows = (await get(`${table}?select=*&order=id&id=gt.${after}&id=lte.${hi}&limit=${PAGE}`)) as { id: number }[];
    if (rows.length) yield rows;
    if (rows.length < PAGE) return;
    after = rows[rows.length - 1].id;
  }
}

async function* offset(table: string, order: string) {
  for (let from = 0; ; from += PAGE) {
    const rows = await get(`${table}?select=*&order=${order}&offset=${from}&limit=${PAGE}`);
    if (rows.length) yield rows;
    if (rows.length < PAGE) return;
  }
}

async function jobsFor(t: Table): Promise<Job[]> {
  const file = (i: number) => join(OUT, `${t.name}.${String(i).padStart(4, "0")}.ndjson`);
  if (t.pk.length === 1 && t.pk[0] === "id") {
    const [first] = (await get(`${t.name}?select=id&order=id.desc&limit=1`)) as { id: unknown }[];
    if (first && typeof first.id === "number") {
      const jobs: Job[] = [];
      for (let lo = 0, i = 0; lo < first.id; lo += RANGE, i++) {
        const [a, b] = [lo, lo + RANGE];
        jobs.push({ table: t.name, file: file(i), pages: () => keyset(t.name, a, b) });
      }
      return jobs;
    }
  }
  // No integer id: offset paging, ordered by the primary key (or every column of a keyless table).
  const order = t.pk.length
    ? t.pk.join(",")
    : psql(`select string_agg(quote_ident(attname), ',' order by attnum) from pg_attribute
            where attrelid = 'public.${t.name}'::regclass and attnum > 0 and not attisdropped`);
  return [{ table: t.name, file: file(0), pages: () => offset(t.name, order) }];
}

async function runJob(job: Job): Promise<number> {
  const out = createWriteStream(job.file);
  let n = 0;
  for await (const rows of job.pages()) {
    for (const r of rows) out.write(JSON.stringify(r) + "\n");
    n += rows.length;
  }
  await new Promise<void>((r) => out.end(r));
  return n;
}

function load(table: string): void {
  const files = readdirSync(OUT).filter((f) => f.startsWith(`${table}.`)).sort().map((f) => join(OUT, f));
  // CSV with control-character quote/delimiter: each NDJSON line lands whole in one jsonb value.
  const copies = files
    .map((f) => `\\copy _stage from '${f}' with (format csv, quote e'\\x01', delimiter e'\\x02')`)
    .join("\n");
  const sql = `
set session_replication_role = replica;
begin;
create temp table _stage (j jsonb) on commit drop;
${copies}
-- delete, not truncate: FK checks are triggers, off under replica, so other tables stay as they are.
delete from public.${table};
do $$
declare cols text;
begin
  select string_agg(quote_ident(c.column_name), ',' order by c.ordinal_position) into cols
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = '${table}' and c.is_generated = 'NEVER'
    and c.column_name in (select jsonb_object_keys(j) from (select j from _stage limit 1) s);
  if cols is null then return; end if;
  execute format('insert into public.%I (%s) overriding system value select %s from _stage, jsonb_populate_record(null::public.%I, j) r',
    '${table}', cols, (select string_agg('r.' || x, ',') from unnest(string_to_array(cols, ',')) x), '${table}');
end $$;
commit;`;
  const r = spawnSync("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`loading ${table}: ${r.stderr}`);
}

// Moves every identity/serial sequence past the copied ids.
function resetSequences(): void {
  psql(`do $$
declare r record;
begin
  for r in select c.table_name, c.column_name, pg_get_serial_sequence(format('public.%I', c.table_name), c.column_name) seq
    from information_schema.columns c
    where c.table_schema = 'public' and pg_get_serial_sequence(format('public.%I', c.table_name), c.column_name) is not null
  loop
    execute format('select setval(%L, coalesce((select max(%I) from public.%I), 0) + 1, false)', r.seq, r.column_name, r.table_name);
  end loop;
end $$;`);
}

async function main() {
  const t0 = Date.now();
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const tables = localTables(process.argv.slice(2));
  const jobs = (await Promise.all(tables.map(jobsFor))).flat();
  const counts = new Map<string, number>();
  let next = 0;
  await Promise.all(
    Array.from({ length: WORKERS }, async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        const n = await runJob(job);
        counts.set(job.table, (counts.get(job.table) ?? 0) + n);
      }
    })
  );
  const fetched = Date.now();
  console.log(`fetched ${[...counts.values()].reduce((a, b) => a + b, 0)} rows in ${((fetched - t0) / 1000).toFixed(0)}s`);
  for (const t of tables) {
    load(t.name);
    console.log(`${t.name}: ${counts.get(t.name) ?? 0}`);
  }
  resetSequences();
  console.log(`loaded in ${((Date.now() - fetched) / 1000).toFixed(0)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
