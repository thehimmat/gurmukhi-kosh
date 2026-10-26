# Local rehearsal: restore production on a Mac and measure bloat

Instructions for Claude Code on a Mac, started in `~/kosh-rehearsal/` with this file saved there. It is
self-contained: nothing else from the repository is needed.

## Goal

Restore a copy of the gurmukhi-kosh production database (Supabase project `brczghxvpfikezsevbkh`, Postgres
17.6) into plain Postgres 17 on this Mac, then answer:

1. **How small does the database get when every table and index is freshly packed?** A fresh restore is the same as
   running `VACUUM FULL` + `REINDEX` on everything, so the restored sizes are the floor production could reach without
   dropping data.
2. **How long do `VACUUM FULL` and `REINDEX` take** on the big tables? That bounds how long production searches would
   be locked if we ran them there.
3. **Does the restore work** (objects and row counts match production), so the copy can be kept as a local dev database?

Supabase stays the production database throughout. This is a read-only copy.

## Safety rules (do not break these)

- Against production, run **only** `pg_dump` and read-only `select` statements through `psql`. No DDL, no
  `insert`/`update`/`delete`, no `vacuum`, no `analyze`, no `set` beyond the session. If a step seems to need more, stop
  and ask.
- Never print, log, echo or commit the connection string or password. Keep it in `~/.pgpass` or an environment
  variable, and don't put it in any file under the repository.
- Work in `~/kosh-rehearsal/`, not in the repository. Commit nothing.
- If anything fails, stop at that step and report it. Don't improvise around it with flags that change what is
  restored.

## 0. Preflight

- Check the machine: `uname -m` (`arm64` = Apple Silicon, `x86_64` = Intel), `sw_vers`, `sysctl -n hw.ncpu hw.memsize`,
  and `df -h ~` (need **5 GB free**).
- See what Postgres is already there: `which -a pg_dump psql`, `pg_dump --version`, and
  `lsof -nP -iTCP -sTCP:LISTEN | grep -i postgres`. An existing server on 5432 is left alone. This plan always runs its
  own 17 server on **port 5433**.
- `mkdir -p ~/kosh-rehearsal && cd ~/kosh-rehearsal`

## 1. Postgres 17 on port 5433

The client tools must be 17.x: a 14 or 16 client refuses to dump a 17 server. **Never build Postgres from source.** If
neither route below works on this Mac, stop and report.

**Apple Silicon (`arm64`)**, with Homebrew (ask before installing Homebrew if it's missing). The package is prebuilt:

```sh
brew install postgresql@17
PGDATA17="$(brew --prefix)/var/postgresql@17"
sed -i '' -E 's/^#?port = [0-9]+/port = 5433/' "$PGDATA17/postgresql.conf"
brew services start postgresql@17
export PG17BIN="$(brew --prefix postgresql@17)/bin"
```

**Intel (`x86_64`)**. Homebrew has no prebuilt Postgres 17 for Intel Macs, so use Postgres.app's universal binaries.
Before installing, check on postgresapp.com (or its GitHub releases) that the current release includes PostgreSQL 17
and supports this macOS version. Tell the user the exact version and URL, and wait for their approval. Then install it
to `/Applications`, but don't start its default server. Run a server of its own inside the rehearsal folder:

```sh
export PG17BIN=/Applications/Postgres.app/Contents/Versions/17/bin
"$PG17BIN/initdb" -D ~/kosh-rehearsal/pgdata -U "$USER" --encoding=UTF8 --locale=C
"$PG17BIN/pg_ctl" -D ~/kosh-rehearsal/pgdata -o "-p 5433" -l ~/kosh-rehearsal/pg.log start
```

That server stops with `"$PG17BIN/pg_ctl" -D ~/kosh-rehearsal/pgdata stop`. Deleting the folder removes it.

**Both:** put the 17 tools first, point every local command at port 5433, and check:

```sh
export PATH="$PG17BIN:$PATH" PGHOST=localhost PGPORT=5433
pg_dump --version && pg_restore --version && psql --version   # all must say 17.x
psql -d postgres -Atc "show server_version"                    # must say 17.x
```

Every later step assumes these three variables are set in the shell. If a new shell is opened, set them again.

## 2. Production connection (the user does this part)

The user should have exported `SUPABASE_DB_URL` (the **Session pooler** connection string from the Supabase
dashboard's **Connect** button) in the terminal *before* launching Claude Code, so it is in this shell's environment.
Check it's set without printing it:

```sh
test -n "$SUPABASE_DB_URL" && echo set || echo MISSING
```

If it's missing, stop and ask the user to quit Claude Code, run
`export SUPABASE_DB_URL='postgresql://postgres.brczghxvpfikezsevbkh:<password>@<host>:5432/postgres'` in that
terminal, and relaunch it. Don't ask them to paste it into the chat. The direct `db.<ref>.supabase.co` host is IPv6-only
on the Free plan and often fails from home networks, so it must be the Session pooler string.

The host and port inside `SUPABASE_DB_URL` take precedence over `PGHOST`/`PGPORT`, so production commands still go to
Supabase while local ones go to 5433.

Then check the connection without printing it:

```sh
psql "$SUPABASE_DB_URL" -Atc "select version()"   # expect PostgreSQL 17.6
```

## 3. Production baseline (read-only)

Save production's sizes and counts at dump time. Row counts can drift if an ingest runs, so the copy is compared
against these numbers, not old ones.

```sh
cat > sizes.sql <<'SQL'
select c.relnamespace::regnamespace::text as schema, c.relname as tbl,
       pg_total_relation_size(c.oid) as total_b,
       pg_relation_size(c.oid) as heap_b,
       pg_indexes_size(c.oid) as idx_b
from pg_class c
where c.relnamespace in ('public'::regnamespace, 'akhar'::regnamespace) and c.relkind in ('r','m')
order by total_b desc;
SQL

cat > counts.sql <<'SQL'
select 'lines', count(*) from lines union all select 'word_occurrences', count(*) from word_occurrences
union all select 'line_translations', count(*) from line_translations union all select 'words', count(*) from words
union all select 'definitions', count(*) from definitions union all select 'padarth_glosses', count(*) from padarth_glosses
union all select 'shabads', count(*) from shabads union all select 'sources', count(*) from sources
union all select 'akhar.annotations', count(*) from akhar.annotations
union all select 'public tables', count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'
union all select 'public indexes', count(*) from pg_indexes where schemaname='public'
union all select 'public functions', count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
union all select 'public policies', count(*) from pg_policies where schemaname='public';
SQL

psql "$SUPABASE_DB_URL" -A -F, -f sizes.sql  > prod-sizes.csv
psql "$SUPABASE_DB_URL" -A -F, -f counts.sql > prod-counts.csv
psql "$SUPABASE_DB_URL" -Atc "select pg_database_size(current_database())" > prod-dbsize.txt
```

For reference, production on 2026-10-26 had: lines 176,312 · word_occurrences 1,137,552 · line_translations 340,491 ·
words 89,753 · definitions 53,560 · padarth_glosses 124,751 · shabads 13,846 · sources 6 · akhar.annotations 1,596 ·
45 tables · 132 indexes · 45 functions · 36 policies. Database 861 MB, `public` tables + indexes 887,037,952 bytes.

## 4. Dump

Dump only the app's schemas (`public`, and `akhar`, which is small). Supabase's own schemas (`auth`, `storage`, `vault`,
`realtime`, `extensions`) belong to the platform and don't restore into plain Postgres. Nothing in `public` references
them. `pg_trgm` is installed in `public`, so name it with `--extension`, or a schema-only dump skips it.

```sh
time pg_dump "$SUPABASE_DB_URL" \
  --format=custom --compress=6 \
  --schema=public --schema=akhar --extension=pg_trgm \
  --no-owner --no-privileges \
  --file=kosh.dump
ls -lh kosh.dump
```

Record the wall time and the file size.

## 5. Local database

Check first that local commands reach the 17 server, not another one (step 1):
`test "$PGPORT" = 5433 && psql -d postgres -Atc "show server_version"` must print 17.x.

The policies name Supabase roles, and some functions set `search_path = public, extensions`, so create those roles
and an empty `extensions` schema first. Drop the default `public` schema so the dump creates its own.

```sh
createdb kosh_rehearsal
psql -d kosh_rehearsal -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon')          then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role')  then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname='akhar_writer')  then create role akhar_writer nologin; end if;
end $$;
create schema if not exists extensions;
drop schema public cascade;
SQL
```

## 6. Restore

```sh
JOBS=$(( $(sysctl -n hw.ncpu) < 4 ? $(sysctl -n hw.ncpu) : 4 ))
time pg_restore --no-owner --no-privileges --jobs=$JOBS -d kosh_rehearsal kosh.dump 2> restore.log
grep -c 'error' restore.log; cat restore.log | head -50
psql -d kosh_rehearsal -c "analyze"
```

Record the wall time. Report every error in `restore.log` as it appears. A clean restore has none. Don't re-run
with `--clean`, and don't skip objects to get past an error. Stop and report instead.

## 7. Check the copy

```sh
psql -d kosh_rehearsal -A -F, -f counts.sql > local-counts.csv
diff prod-counts.csv local-counts.csv && echo "COUNTS MATCH"
```

Everything must match. Then smoke-test a few search RPCs (any non-error result counts):

```sh
psql -d kosh_rehearsal <<'SQL'
select count(*) from search_first_letters(array['ਸ','ਨ','ਕ','ਪ']);   -- production: 8
select count(*) from search_words_fuzzy('ਸਤ', 1);
select count(*) from search_lines_by_word_ids(array[(select id from words order by frequency desc limit 1)]::bigint[]);
select jsonb_typeof(health_stats());
SQL
```

## 8. Sizes: production vs freshly packed

```sh
psql -d kosh_rehearsal -A -F, -f sizes.sql > local-sizes.csv
psql -d kosh_rehearsal -Atc "select pg_database_size(current_database())" > local-dbsize.txt
```

Join `prod-sizes.csv` and `local-sizes.csv` on `schema, tbl`. For each table, report total, heap and index size in
production, the same freshly packed, and the difference. Also report the totals over all tables. This answers question 1.

Note: `pg_database_size` in production also counts Supabase's own schemas (~15 MB) and catalog, so compare table
totals, not database sizes.

## 9. Maintenance timings

The copy is already packed, so these runs time a rewrite of the same data that production would do. Supabase Free
is a small shared instance: on an Apple Silicon Mac, treat these times as a **lower bound** for production. An older
Intel dual-core is closer to it. Either way, put the hardware next to the times in the report.

```sh
psql -d kosh_rehearsal <<'SQL'
\timing on
vacuum full lines;
vacuum full word_occurrences;
vacuum full line_translations;
vacuum full definitions;
vacuum full words;
reindex table lines;
reindex table word_occurrences;
reindex table line_translations;
SQL
```

Record each time. `VACUUM FULL` rebuilds the table's indexes too, so its time is what production's lock would last.

## 10. Report

Write `~/kosh-rehearsal/REPORT.md` and print it, so the user can paste it back:

- Machine (chip, RAM), Postgres version, free disk before and after.
- Times for dump, restore and each maintenance statement. Dump file size.
- Count check: match, or the rows that differ.
- Restore errors: none, or each one.
- The size table from step 8, top 15 tables plus totals. The headline is the "freshly packed" total against
  the 500 MB Supabase Free limit.
- Anything surprising.

## Keep it as a dev database

Leave `kosh_rehearsal` and `kosh.dump` in place. The local connection string is
`postgresql://localhost:5433/kosh_rehearsal` (as the macOS user, no password). It has no Supabase auth or PostgREST.
To stop the 17 server: `brew services stop postgresql@17` (Apple Silicon) or
`"$PG17BIN/pg_ctl" -D ~/kosh-rehearsal/pgdata stop` (Intel). Any other Postgres server on 5432 was never touched.
