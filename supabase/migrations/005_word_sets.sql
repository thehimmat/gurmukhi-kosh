-- 005_word_sets.sql
-- Named word sets scope enrichment work to a slice of the corpus (e.g. one bani).
-- The V1 pilot is Japji Sahib; the mechanism is parameterized so other banis,
-- ang ranges, or shabad-id lists follow without code changes.
--
-- definition jsonb is one of:
--   {"type":"banidb_bani","baniId":1}
--   {"type":"ang_range","start":1,"end":8}
--   {"type":"shabad_ids","ids":[...]}
--
-- Idempotent: safe to re-run.

create table if not exists word_sets (
  id          bigserial primary key,
  code        text not null unique,   -- 'japji', etc.
  name        text not null,
  description text,
  definition  jsonb not null,         -- how membership is derived (see above)
  built_at    timestamptz,            -- last time members were materialized
  created_at  timestamptz default now()
);

create table if not exists word_set_members (
  word_set_id      bigint not null references word_sets(id) on delete cascade,
  word_id          bigint not null references words(id) on delete cascade,
  occurrence_count int not null default 0,  -- occurrences of this word within the set
  primary key (word_set_id, word_id)
);
create index if not exists word_set_members_word_id on word_set_members (word_id);

alter table word_sets        enable row level security;
alter table word_set_members enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'word_sets' and policyname = 'public read word_sets') then
    create policy "public read word_sets" on word_sets for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'word_set_members' and policyname = 'public read word_set_members') then
    create policy "public read word_set_members" on word_set_members for select using (true);
  end if;
end $$;
