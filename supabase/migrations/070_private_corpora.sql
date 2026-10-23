-- 070: private corpora. A corpus source (sources) is public only when its code is public in
-- source_rights (069), so a text can be loaded for the curator and kept from the public until
-- permission to publish it is settled (Sri Gur Sobha, ISS 2014 edition: pipeline/gur-sobha/README.md).
--
-- 069 gates the dictionary and translation sources by code; corpus text (lines, sources, shabads,
-- word occurrences) stayed readable by anyone (RLS `using (true)`). This extends the same gate to it:
--
-- 1. The corpora loaded so far get public source_rights rows, so nothing visible today disappears.
--    lines.is_public says whether a line's source code is public, kept by trigger (on lines, and on
--    source_rights) as corpus_rank is (065), so the policy on the hottest table is a plain boolean.
-- 2. The API roles (anon, authenticated) don't see a private corpus or anything that points at it:
--    sources, lines, shabads and passages (by source), word and number occurrences (by line),
--    per-source word stats. Translations and padarth glosses keep 069's source_code check and add
--    their line's; padarth occurrences and case evidence follow their glosses (069). The service
--    role (the curator) bypasses RLS and sees everything.
-- 3. Counts derived from the corpus come from public lines only: words.frequency and in_corpus (a
--    word only a private corpus attests is not a public headword), the word_writer_stats matview,
--    and health_stats (security definer, so RLS doesn't reach it). word_corpus_stats and
--    word_corpus_writer_stats keep their private rows, which RLS hides.
-- 4. refresh_computed_stats() is no longer executable by anon (006 granted it).
-- 5. The line searches run as definer and filter is_public themselves. Under RLS, Postgres won't use
--    an index whose operator isn't leakproof (069 keeps `words` at `true` for the same reason): fuzzy
--    search went from ~3 ms to ~780 ms on 30,000 lines.
--
-- bigrams and collocations are computed outside the database (pipeline/compute/collocations.ts),
-- which reads public lines only.
--
-- Publishing a corpus is one update (069's), then re-run refresh_word_frequencies and
-- refresh_word_corpus_stats, and refresh word_writer_stats:
--   update source_rights set visibility = 'public', rights_status = 'permitted' where code = '…';

-- ─── 1. which corpora are public ─────────────────────────────────────────────

insert into source_rights (code, visibility, rights_status, notes) values
  ('sggs_banidb_v2',        'public', 'pd',      'Sri Guru Granth Sahib, via BaniDB'),
  ('dasam_banidb_v2',       'public', 'pd',      'Dasam Bani, via BaniDB'),
  ('bhai_gurdas_banidb_v2', 'public', 'pd',      'Vaaran Bhai Gurdas Ji, via BaniDB'),
  ('sarbloh_budha_dal',     'public', 'pending', 'Budha Dal print, retyped; Budha Dal reserves the mool bani, permission being checked (pipeline/scans/README.md)'),
  ('nand_lal_ghazals',      'public', 'unknown', 'Our typed copy of an unnamed printed edition (pipeline/nand-lal/README.md)')
on conflict (code) do nothing;

alter table lines add column if not exists is_public boolean not null default true;

create or replace function source_code_is_public(p_source_fk bigint)
returns boolean
language sql stable
set search_path = public
as $$
  select exists (
    select 1 from sources s join source_rights r on r.code = s.code
     where s.id = p_source_fk and r.visibility = 'public'
  )
$$;

update lines l set is_public = source_code_is_public(l.source_fk)
 where l.is_public is distinct from source_code_is_public(l.source_fk);

create or replace function lines_set_is_public()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.is_public := source_code_is_public(new.source_fk);
  return new;
end;
$$;

drop trigger if exists lines_set_is_public on lines;
create trigger lines_set_is_public
  before insert or update of source_fk on lines
  for each row execute function lines_set_is_public();

-- A source_rights change re-marks the lines of the corpus with that code (if any).
create or replace function source_rights_propagate_to_lines()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  c text := coalesce(new.code, old.code);
begin
  update lines l set is_public = source_code_is_public(l.source_fk)
   where l.source_fk in (select id from sources where code = c)
     and l.is_public is distinct from source_code_is_public(l.source_fk);
  return null;
end;
$$;

drop trigger if exists source_rights_propagate_to_lines on source_rights;
create trigger source_rights_propagate_to_lines
  after insert or update or delete on source_rights
  for each row execute function source_rights_propagate_to_lines();

-- The lines policy reads is_public, so first-letter search (045, 051) stays an index-only scan only
-- if its covering index carries it. 045's lines_first_letters_cover is superseded but kept, as 045
-- kept 044's: dropping it is a dashboard statement (APPLIED.md).
create index if not exists lines_first_letters_cover_public
  on lines (first_letters text_pattern_ops)
  include (id, corpus_rank, ang, line_no, shabad_id, source_fk, is_public);

-- ─── 2. RLS ──────────────────────────────────────────────────────────────────
-- Policies by source use an uncorrelated `in (select …)`, which Postgres computes once per query,
-- not per row: shabads is joined by every line search.

drop policy if exists "public read sources" on sources;
create policy "public read sources" on sources for select using (code in (select code from public_source_codes));

drop policy if exists "public read lines" on lines;
create policy "public read lines" on lines for select using (is_public);

drop policy if exists "public read shabads" on shabads;
create policy "public read shabads" on shabads for select using (
  source_fk is null or source_fk in (select id from sources where code in (select code from public_source_codes))
);

drop policy if exists "public read passages" on passages;
create policy "public read passages" on passages for select using (
  source_fk in (select id from sources where code in (select code from public_source_codes))
);

drop policy if exists "public read word_occurrences" on word_occurrences;
create policy "public read word_occurrences" on word_occurrences for select using (
  exists (select 1 from lines l where l.id = word_occurrences.line_id and l.is_public)
);

drop policy if exists "public read number_occurrences" on number_occurrences;
create policy "public read number_occurrences" on number_occurrences for select using (
  exists (select 1 from lines l where l.id = number_occurrences.line_id and l.is_public)
);

drop policy if exists "public read line_translations" on line_translations;
create policy "public read line_translations" on line_translations for select using (
  source_code in (select code from public_source_codes)
  and exists (select 1 from lines l where l.id = line_translations.line_id and l.is_public)
);

drop policy if exists "public read padarth_glosses" on padarth_glosses;
create policy "public read padarth_glosses" on padarth_glosses for select using (
  source_code in (select code from public_source_codes)
  and exists (select 1 from lines l where l.id = padarth_glosses.line_id and l.is_public)
);

drop policy if exists "public read word_corpus_stats" on word_corpus_stats;
create policy "public read word_corpus_stats" on word_corpus_stats for select using (
  source_fk in (select id from sources where code in (select code from public_source_codes))
);

drop policy if exists "public read word_corpus_writer_stats" on word_corpus_writer_stats;
create policy "public read word_corpus_writer_stats" on word_corpus_writer_stats for select using (
  source_fk in (select id from sources where code in (select code from public_source_codes))
);

-- ─── 3. counts from public sources ───────────────────────────────────────────

create or replace function refresh_word_frequencies() returns void
language sql security definer
set search_path = public
set statement_timeout = '900s'
as $$
  update words
  set frequency = c.cnt
  from (
    select w.id, coalesce(o.cnt, 0) as cnt
    from words w
    left join (
      select wo.word_id, count(*) as cnt
        from word_occurrences wo join lines l on l.id = wo.line_id
       where l.is_public
       group by wo.word_id
    ) o on o.word_id = w.id
  ) c
  where words.id = c.id
    and words.frequency is distinct from c.cnt;
$$;

create or replace function refresh_word_corpus_stats() returns void
language sql security definer
set search_path = public
set statement_timeout = '900s'
as $$
  delete from word_corpus_stats where true;

  insert into word_corpus_stats (word_id, source_fk, frequency)
  select wo.word_id, l.source_fk, count(*)
  from word_occurrences wo
  join lines l on l.id = wo.line_id
  group by wo.word_id, l.source_fk;

  -- A word a public corpus attests is in-corpus: that flips dictionary head-words (Shackle,
  -- in_corpus = false) once an ingested text attests them. A word only a private source attests is
  -- not (words enter with in_corpus = true, 018), and turns in-corpus when its source is published
  -- and this is re-run. Words no corpus attests keep their value.
  update words
  set in_corpus = exists (
    select 1 from word_occurrences wo join lines l on l.id = wo.line_id
     where wo.word_id = words.id and l.is_public
  )
  where exists (select 1 from word_occurrences wo where wo.word_id = words.id)
    and in_corpus is distinct from exists (
      select 1 from word_occurrences wo join lines l on l.id = wo.line_id
       where wo.word_id = words.id and l.is_public
    );
$$;

drop materialized view if exists word_writer_stats cascade;
create materialized view word_writer_stats as
select
  w.id            as word_id,
  s.writer_id,
  min(s.writer_english) as writer_english,
  count(*)        as occurrence_count
from words w
join word_occurrences wo on wo.word_id = w.id
join lines l            on l.id = wo.line_id
join shabads s          on s.id = l.shabad_id
where s.writer_id is not null
  and l.is_public
group by w.id, s.writer_id;
create unique index if not exists word_writer_stats_idx
  on word_writer_stats (word_id, writer_id);
grant select on word_writer_stats to anon, authenticated, service_role;

create or replace function health_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
set statement_timeout = '20s'
as $$
  select jsonb_build_object(
    'total_words', (select count(*) from words),
    'total_lines', (select count(*) from lines where is_public),
    'total_angs', (select count(distinct ang) from lines where is_public),
    'total_occurrences', (
      select count(*) from word_occurrences wo join lines l on l.id = wo.line_id where l.is_public
    ),
    'dict_sources_registered', (select count(*) from dict_sources),
    'translation_sources_registered', (select count(*) from translation_sources),

    'lines_per_source', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select lt.source_code, count(*) as rows, count(distinct lt.line_id) as lines
        from line_translations lt join lines l on l.id = lt.line_id
        where l.is_public
        group by lt.source_code order by rows desc
      ) t
    ),
    'lines_with_no_commentary', (
      select count(*) from lines l
      where l.is_public
        and not exists (select 1 from line_translations lt where lt.line_id = l.id)
    ),
    'empty_bodies', (select count(*) from line_translations where btrim(body_unicode) = ''),

    'definitions_total', (select count(*) from definitions),
    'words_with_definition', (select count(distinct word_id) from definitions),
    'words_without_definition', (
      select count(*) from words w
      where not exists (select 1 from definitions d where d.word_id = w.id)
    ),
    'definitions_per_source', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select ds.code, ds.name, count(d.id) as rows, count(distinct d.word_id) as words
        from dict_sources ds left join definitions d on d.dict_source_id = ds.id
        group by ds.code, ds.name order by rows desc
      ) t
    ),
    'words_with_definition_but_no_pos', (
      select count(distinct d.word_id) from definitions d
      where not exists (select 1 from word_grammar g where g.word_id = d.word_id)
    ),

    'word_grammar_total', (select count(*) from word_grammar),
    'words_with_any_grammar', (select count(distinct word_id) from word_grammar),
    'sourced_vs_rule', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select provenance, count(*) as rows, count(distinct word_id) as words
        from word_grammar group by provenance order by rows desc
      ) t
    ),
    'sourced_only_words', (
      select count(distinct word_id) from word_grammar g1
      where g1.provenance = 'imported'
        and not exists (
          select 1 from word_grammar g2
          where g2.word_id = g1.word_id and g2.provenance <> 'imported'
        )
    ),
    'grammar_unreviewed', (select count(*) from word_grammar where review_status = 'unreviewed'),

    'etymology_total', (select count(*) from etymology),
    'words_with_etymology', (select count(distinct word_id) from etymology),

    'dup_line_source', (
      select count(*) from (
        select 1 from line_translations group by line_id, source_code having count(*) > 1
      ) t
    ),
    'orphan_grammar', (
      select count(*) from word_grammar g where not exists (select 1 from words w where w.id = g.word_id)
    ),
    'orphan_definitions', (
      select count(*) from definitions d where not exists (select 1 from words w where w.id = d.word_id)
    ),
    'provenance_breakdown', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select 'definitions' as table_name, provenance, count(*) as rows from definitions group by provenance
        union all
        select 'word_grammar', provenance, count(*) from word_grammar group by provenance
        order by table_name, rows desc
      ) t
    ),
    'review_status_breakdown', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select 'definitions' as table_name, review_status, count(*) as rows from definitions group by review_status
        union all
        select 'word_grammar', review_status, count(*) from word_grammar group by review_status
        order by table_name, rows desc
      ) t
    ),

    'open_flags_total', (select count(*) from flags where status = 'open'),
    'open_flags_by_target', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select coalesce(target_table, 'word-level') as target, count(*) as rows
        from flags where status = 'open'
        group by coalesce(target_table, 'word-level') order by rows desc
      ) t
    ),
    'open_flags_by_type', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select flag_type, count(*) as rows from flags where status = 'open'
        group by flag_type order by rows desc
      ) t
    )
  );
$$;

grant execute on function health_stats() to anon, authenticated;

-- ─── 5. line searches read public lines themselves ───────────────────────────
-- Under RLS, Postgres won't use an index for a condition whose operator isn't leakproof until the
-- policy has been applied, and the trigram and LIKE operators aren't (a non-superuser can't mark
-- them). Measured on 30,000 lines as anon: fuzzy search went from ~3 ms (trigram index) to ~780 ms
-- (sequential scan). So the line searches run as definer, which bypasses RLS, and read
-- `(select * from lines where is_public)` in place of `lines`. Postgres folds the subquery into the
-- query, so the index conditions stand. Each function's current definition is patched where it is,
-- rather than copied here, so later in-place fixes (055) stay. A definer function gets a fixed
-- search_path; `extensions` is where Supabase keeps pg_trgm.
do $$
declare
  f record;
  def text;
begin
  for f in
    select p.oid, p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname ~ '^(search_lines_|count_lines_|search_first_letters|search_number_lines|count_number_roles)'
       and pg_get_functiondef(p.oid) ~ '\m(from|join)\s+(public\.)?(lines|number_occurrences)\M'
  loop
    def := pg_get_functiondef(f.oid);
    -- `from lines where …` (no alias): name the subquery `lines`. A placeholder stands for the
    -- table until both passes and the check are done, so neither pass reads the other's output.
    def := regexp_replace(def,
      '\m(from|join)\s+(public\.)?lines(\s+)(where|on|join|left|inner|order|group|limit|union)\M',
      '\1 (select * from @@public_lines@@ where is_public) lines\3\4', 'gi');
    -- `from lines l`, `join lines l2`
    def := regexp_replace(def,
      '\m(from|join)\s+(public\.)?lines\s+(as\s+)?([a-z_][a-z0-9_]*)',
      '\1 (select * from @@public_lines@@ where is_public) \4', 'gi');
    -- number_occurrences, which count_number_roles reads without lines when unfiltered (053)
    def := regexp_replace(def,
      '\m(from|join)\s+(public\.)?number_occurrences\s+(as\s+)?([a-z_][a-z0-9_]*)',
      '\1 (select * from @@public_numbers@@ where line_id in (select id from @@public_lines@@ where is_public)) \4', 'gi');
    if def ~* '\m(from|join)\s+(public\.)?(lines|number_occurrences)\M' then
      raise exception '070: % still reads lines or number_occurrences directly', f.sig;
    end if;
    def := replace(replace(def, '@@public_lines@@', 'public.lines'), '@@public_numbers@@', 'public.number_occurrences');
    if def !~* 'SECURITY DEFINER' then
      def := regexp_replace(def, E'(\n LANGUAGE [a-z]+\n)', E'\\1 SECURITY DEFINER\n', 'i');
    end if;
    if def !~* E'\n SET search_path' then
      def := regexp_replace(def, E'(\n LANGUAGE [a-z]+\n)', E'\\1 SET search_path TO ''public'', ''extensions'', ''pg_temp''\n', 'i');
    end if;
    execute def;
  end loop;
end $$;

-- ─── 4. refreshes are not for the API roles ──────────────────────────────────

revoke execute on function refresh_computed_stats() from public, anon, authenticated;
