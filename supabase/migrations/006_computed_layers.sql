-- 006_computed_layers.sql
-- Computed layers: bigrams, collocations, and statistics matviews.
-- All are read-only, populated by pipeline/compute/collocations.ts.
-- word_source_stats, word_writer_stats, word_stem_groups are matviews
-- refreshed via RPC refresh_computed_stats() after major ingests.
-- Idempotent: safe to re-run.

-- Add source_fk to shabads (multi-corpus prep; default SGGS = dict_source_id 1).
alter table shabads add column if not exists source_fk bigint references dict_sources(id) default 1;

-- Bigrams: consecutive word pairs in lines, ordered.
create table if not exists bigrams (
  id         bigserial primary key,
  w1_id      bigint not null references words(id) on delete cascade,
  w2_id      bigint not null references words(id) on delete cascade,
  pair_count int not null default 0,
  unique(w1_id, w2_id)
);
create index if not exists bigrams_w1_id on bigrams (w1_id);
create index if not exists bigrams_w2_id on bigrams (w2_id);

-- Collocations: unordered word pairs within a window (default |Δpos|≤3),
-- with pair_count and PMI (Pointwise Mutual Information).
create table if not exists collocations (
  id         bigserial primary key,
  word_a_id  bigint not null references words(id) on delete cascade,
  word_b_id  bigint not null references words(id) on delete cascade,
  window_size int not null default 3,  -- |Δpos| threshold
  pair_count int not null default 0,   -- raw co-occurrence count
  pmi        float8,                   -- pointwise mutual information (log2)
  unique(word_a_id, word_b_id, window_size)
);
create index if not exists collocations_word_a_id on collocations (word_a_id);
create index if not exists collocations_word_b_id on collocations (word_b_id);
create index if not exists collocations_pmi_desc on collocations (pmi desc nulls last) where pmi is not null;

-- word_source_stats: how many definitions each word has per dict_source.
create materialized view if not exists word_source_stats as
select
  w.id as word_id,
  d.dict_source_id,
  count(*) as def_count
from words w
left join definitions d on d.word_id = w.id
group by w.id, d.dict_source_id;
create unique index if not exists word_source_stats_idx on word_source_stats (word_id, dict_source_id);
grant select on word_source_stats to anon;

-- word_writer_stats: occurrence frequency by writer (author).
create materialized view if not exists word_writer_stats as
select
  w.id as word_id,
  s.writer_id,
  count(*) as occurrence_count
from words w
join word_occurrences wo on wo.word_id = w.id
join lines l on l.id = wo.line_id
join shabads s on s.id = l.shabad_id
where s.writer_id is not null
group by w.id, s.writer_id;
create unique index if not exists word_writer_stats_idx on word_writer_stats (word_id, writer_id);
grant select on word_writer_stats to anon;

-- word_stem_groups: related forms via trailing-vowel strip (cheap auto-grouping).
-- Example: ਨਾਮ, ਨਾਮੁ, ਨਾਮਾ → stem 'ਨਾਮ'.
create materialized view if not exists word_stem_groups as
with stemmed as (
  select
    id as word_id,
    gurmukhi,
    -- Strip final ਾ ਿ ੀ ੁ ਂ ਿ ਂ ਿਂ ਂ ⁰ (inherent schwa, vowels, nasals).
    -- Use regexp_replace to remove common final marks.
    regexp_replace(gurmukhi, '[ਾਿੀੁਂੰਕ਼ਖ਼ਗ਼ਜ਼ਡ਼ਢ਼ਫ਼ਾਿੀੁਂੰ]*$', '') as stem
  from words
)
select
  word_id,
  gurmukhi,
  stem,
  count(*) over (partition by stem) as stem_group_size
from stemmed
where stem != '' and stem != gurmukhi;  -- exclude stems identical to full word
grant select on word_stem_groups to anon;

-- RPC to refresh all matviews after an ingest. Called by pipeline after bigrams/collocations
-- are populated. Leaves refresh_word_frequencies() alone (voice-search depends on it).
create or replace function refresh_computed_stats()
returns void as $$
begin
  refresh materialized view concurrently word_source_stats;
  refresh materialized view concurrently word_writer_stats;
  refresh materialized view concurrently word_stem_groups;
end;
$$ language plpgsql;
grant execute on function refresh_computed_stats() to anon;

alter table bigrams      enable row level security;
alter table collocations enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'bigrams' and policyname = 'public read bigrams') then
    create policy "public read bigrams" on bigrams for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'collocations' and policyname = 'public read collocations') then
    create policy "public read collocations" on collocations for select using (true);
  end if;
end $$;
