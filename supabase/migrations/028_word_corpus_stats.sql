-- 028: per-corpus word frequencies (#65, decided 2026-08-15).
--
-- words.frequency stays the TOTAL across every ingested corpus (the existing
-- refresh_word_frequencies already counts all word_occurrences); this table
-- carries the per-corpus split so every displayed number can say which text
-- it counts. Rebuilt, not incrementally maintained: one refresh call derives
-- it from word_occurrences x lines, the same pattern as the total.
--
-- Named word_CORPUS_stats deliberately: word_source_stats already exists
-- (migration 006) as a matview of definition counts per DICTIONARY source
-- (dict_sources). "Corpus" here always means a scripture/text source in the
-- `sources` table, never a dictionary.

create table if not exists word_corpus_stats (
  word_id bigint not null references words(id) on delete cascade,
  source_fk bigint not null references sources(id) on delete cascade,
  frequency integer not null,
  primary key (word_id, source_fk)
);
create index if not exists idx_wcs_source on word_corpus_stats (source_fk);

alter table word_corpus_stats enable row level security;
create policy "public read word_corpus_stats" on word_corpus_stats for select using (true);

-- Body references word_corpus_stats, created above in this same migration;
-- with check_function_bodies on, create-time validation rejects it, so
-- validation is deferred to first call (the ingest calls it every run).
set local check_function_bodies = off;

create or replace function refresh_word_corpus_stats() returns void
language sql security definer set search_path = public as $$
  delete from word_corpus_stats;
  insert into word_corpus_stats (word_id, source_fk, frequency)
  select wo.word_id, l.source_fk, count(*)
  from word_occurrences wo
  join lines l on l.id = wo.line_id
  group by wo.word_id, l.source_fk;

  -- A word attested in ANY ingested corpus is in-corpus. This flips words
  -- that entered as dictionary head-words (Shackle, in_corpus=false) once a
  -- newly ingested text attests them: their spelling is no longer inferred.
  update words
  set in_corpus = true
  where in_corpus = false
    and exists (select 1 from word_occurrences wo where wo.word_id = words.id);
$$;

-- Second corpus (#65): Bhai Gurdas Ji Vaaran via the same BaniDB v2 API as
-- SGGS (SourceID 'B', pages 1-40 = vaars; shabadIds are namespaced per
-- source, 40001+, so the shared shabads table cannot collide).
insert into sources (code, name, version, description)
values (
  'bhai_gurdas_banidb_v2',
  'Bhai Gurdas Ji Vaaran',
  'banidb-v2',
  'Vaaran Bhai Gurdas Ji (40 vaars) fetched from the BaniDB v2 API (SourceID B).'
)
on conflict (code) do nothing;
