-- 014_flags.sql
-- Word-level community flagging (P4): anyone can flag a datum as wrong, unclear,
-- or point at a better source. Flags are write-only for the public (insert-only
-- RLS) — nobody, including the flagger, can read them back. Only the key-gated
-- /admin/flags surface (using the service-role client, bypassing RLS) reads and
-- actions them, optionally updating the target row's existing review_status /
-- curation_note columns (migration 003) so a resolved flag becomes part of the
-- same provenance trail every other datum already carries.

create table if not exists flags (
  id               bigserial primary key,
  word_id          bigint not null references words(id) on delete cascade,
  -- Which datum the flag is about. Null target_table/target_id = about the
  -- word generally (e.g. a decomposed grammar attribute view, not one row).
  target_table     text check (target_table in ('word_grammar', 'definitions', 'etymology')),
  target_id        bigint,
  flag_type        text not null default 'incorrect'
                   check (flag_type in ('incorrect', 'unclear', 'has_better_source', 'other')),
  message          text not null,
  suggested_source text,
  reporter_name    text,
  reporter_email   text,
  status           text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolution_note  text,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists flags_word_id on flags (word_id);
create index if not exists flags_open_idx on flags (created_at) where status = 'open';

alter table flags enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'flags' and policyname = 'public insert flags') then
    create policy "public insert flags" on flags for insert with check (true);
  end if;
end $$;
-- Deliberately no select/update/delete policy for anon/authenticated: flags are
-- write-only from the public side. Admin actions use the service-role client.
