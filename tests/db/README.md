# Schema tests (local Postgres)

`replay.ts` builds an in-process Postgres ([PGlite](https://pglite.dev)) with every migration that
shaped the shared Supabase project, in server-ledger order (`supabase/APPLIED.md`):

1. `supabase-bootstrap.sql`: the `anon`, `authenticated` and `service_role` roles, and Supabase's
   default grants. RLS, not grants, is what limits anon, as in production.
2. `supabase/migrations/*` in number order, with these slotted in where the ledger has them:
   - the sibling repos' migrations (`supabase/migrations-imported/gurmukhi-*`)
   - the UNFILED ledger entries (`supabase/migrations-imported/unfiled`)
   - dashboard-run statements (`supabase/migrations-imported/dashboard`)
3. `sggs-source.sql`, run right after 001, so the sources get their production ids.

Usage:

```ts
import { freshDb } from "./replay";

const db = await freshDb(); // a migrated database of its own, with no corpus rows
await db.exec(linesLoadSql("nand_lal_ghazals", lines).sql);
await db.exec("set role anon"); // test as the API role
```

The first call builds the database (about 7 s); later calls in the same test file clone it.
`pg_trgm` and `pgcrypto` are loaded. Other extensions are not: add them from `@electric-sql/pglite/contrib/*` in
`migrate()` when a migration needs one.

## A new migration

It replays automatically, in number order after the rest. Write its test here before applying it.
Anything run outside a migration file (a dashboard statement) goes in
`supabase/migrations-imported/dashboard/` and into `BEFORE` in `replay.ts`.

## Checking the replay against production

Run this on both databases and diff the output. Use `freshDb()` locally and the Supabase MCP
`execute_sql` for live:

```sql
select 'col '||table_name||'.'||column_name||' '||data_type from information_schema.columns where table_schema='public'
union all select 'fn '||p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f'
    and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
union all select 'idx '||indexname from pg_indexes where schemaname='public'
order by 1;
```

On 2026-10-19, columns, functions and indexes matched apart from two legacy items, both from
before the ledger:

- `lines.source_id` (text) exists only in production. It is the pre-`sources` column that
  `add_sources_table` kept "for now". No code reads it; the `Line` type in `lib/supabase.ts`
  still declares it.
- The `lines_source_fk` index exists only in the replay (001 creates it). Production has no
  such index, and no record says when it went.

On 2026-11-04 (#253), after filing the three `mk_*` ledger entries, the replay up to 075 matched production
(Supabase as restored to the VM) on functions (45) and on everything else apart from the same two legacy items:
444 columns against 443 (`lines.source_id`, dropped by 081) and 132 indexes against 133 (`lines_source_fk`).

Function bodies, constraints and RLS policies are not compared.
