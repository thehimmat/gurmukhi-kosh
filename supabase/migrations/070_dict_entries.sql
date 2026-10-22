-- 070: the raw dictionary-entry layer (plan Phase 0, #249).
--
-- `definitions` needs a word_id, so a dictionary entry for a word the Kosh hasn't seen can't be
-- stored there. `dict_entries` holds every entry a dictionary prints, word or no word; new
-- scriptures bring new words, and each is looked up against the entries already stored.
-- `definitions` stays the curated, word-linked layer that reviewed senses are promoted into.
--
-- entry_ref is the stable, immutable id of an entry: `<dict_sources.code>:<key>`, where the key is
-- whatever the source keeps stable (`mahan_kosh:ਨਾਮ#2`, or SikhRI's own id, `sikhri:wn33071`).
--
-- `dict_entry_links` joins an entry to a word or a lexeme. Links made by matching are rule-derived,
-- so they stay curator-only until a curator approves them (#137).
--
-- Visibility follows source_rights (069): a curator-only source's entries are hidden from the API
-- roles, and the curator reads them through the service role.

create table if not exists dict_entries (
  id                bigserial primary key,
  dict_source_id    bigint not null references dict_sources(id),
  entry_ref         text not null unique,
  seq               int,            -- order in the source, where it has one
  page              text,           -- printed page, for scans
  headword_native   text not null,  -- as printed, in the source's own script
  script            text not null,  -- 'gurmukhi', 'devanagari', 'arabic', 'latin', …
  headword_gurmukhi text,           -- the Gurmukhi spelling it links on (null when there is none)
  search_fold       text,           -- foldGurmukhi(headword_gurmukhi), lib/gurmukhi-fold.ts
  body_raw          text not null,  -- the entry's text, as the source gives it
  parsed            jsonb,          -- source-specific structure (senses, grammar, etymology, …)
  ocr_confidence    real,
  source_url        text,
  review_status     text not null default 'unreviewed'
                    check (review_status in ('unreviewed', 'unverified_ocr', 'approved', 'needs_work', 'rejected')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists dict_entries_source on dict_entries (dict_source_id);
create index if not exists dict_entries_headword on dict_entries (headword_gurmukhi);
create index if not exists dict_entries_fold on dict_entries (search_fold);

-- entry_ref belongs to its source and never changes once written.
create or replace function dict_entries_guard_ref() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare code text;
begin
  if tg_op = 'UPDATE' and (new.entry_ref <> old.entry_ref or new.dict_source_id <> old.dict_source_id) then
    raise exception 'dict_entries.entry_ref is immutable (%)', old.entry_ref;
  end if;
  select s.code into code from dict_sources s where s.id = new.dict_source_id;
  if left(new.entry_ref, length(code) + 1) <> code || ':' then
    raise exception 'entry_ref % must start with %:', new.entry_ref, code;
  end if;
  return new;
end $$;
drop trigger if exists dict_entries_guard_ref on dict_entries;
create trigger dict_entries_guard_ref before insert or update on dict_entries
  for each row execute function dict_entries_guard_ref();

create table if not exists dict_entry_links (
  id            bigserial primary key,
  entry_id      bigint not null references dict_entries(id) on delete cascade,
  word_id       bigint references words(id) on delete cascade,
  lexeme_id     bigint references lexemes(id) on delete cascade,
  match_method  text not null check (match_method in ('exact', 'fold', 'manual')),
  confidence    real,
  review_status text not null default 'unreviewed'
                check (review_status in ('unreviewed', 'approved', 'needs_work', 'rejected')),
  created_at    timestamptz not null default now(),
  check (num_nonnulls(word_id, lexeme_id) = 1)
);
create unique index if not exists dict_entry_links_word on dict_entry_links (entry_id, word_id) where word_id is not null;
create unique index if not exists dict_entry_links_lexeme on dict_entry_links (entry_id, lexeme_id) where lexeme_id is not null;
create index if not exists dict_entry_links_word_id on dict_entry_links (word_id);

-- ── Visibility ────────────────────────────────────────────────────────────────
alter table dict_entries enable row level security;
drop policy if exists "public read dict_entries" on dict_entries;
create policy "public read dict_entries" on dict_entries for select using (
  dict_source_id in (select d.id from dict_sources d where d.code in (select code from public_source_codes))
);

-- An approved link on an entry the caller may see. The subquery runs under the caller's RLS.
alter table dict_entry_links enable row level security;
drop policy if exists "public read dict_entry_links" on dict_entry_links;
create policy "public read dict_entry_links" on dict_entry_links for select using (
  review_status = 'approved' and exists (select 1 from dict_entries e where e.id = entry_id)
);

grant select on dict_entries, dict_entry_links to anon, authenticated;

-- ── Linking ───────────────────────────────────────────────────────────────────
-- Proposes links for one source's entries (or every source's, with null), optionally only to the
-- given words: a corpus ingest passes its new words so they meet the entries already stored.
-- An exact Gurmukhi match first; the orthographic fold only for entries with no exact match.
-- Every proposed link is unreviewed. Returns the number of links added.
create or replace function link_dict_entries(p_source_code text default null, p_word_ids bigint[] default null)
returns int language plpgsql set search_path = public, pg_temp as $$
declare added int; more int;
begin
  insert into dict_entry_links (entry_id, word_id, match_method, confidence)
  select e.id, w.id, 'exact', 1.0
    from dict_entries e
    join dict_sources s on s.id = e.dict_source_id
    join words w on w.gurmukhi = e.headword_gurmukhi
   where (p_source_code is null or s.code = p_source_code)
     and (p_word_ids is null or w.id = any(p_word_ids))
  on conflict (entry_id, word_id) where word_id is not null do nothing;
  get diagnostics added = row_count;

  insert into dict_entry_links (entry_id, word_id, match_method, confidence)
  select e.id, w.id, 'fold', 0.5
    from dict_entries e
    join dict_sources s on s.id = e.dict_source_id
    join words w on w.search_fold = e.search_fold
   where e.search_fold is not null and e.search_fold <> ''
     and (p_source_code is null or s.code = p_source_code)
     and (p_word_ids is null or w.id = any(p_word_ids))
     and not exists (select 1 from words x where x.gurmukhi = e.headword_gurmukhi)
  on conflict (entry_id, word_id) where word_id is not null do nothing;
  get diagnostics more = row_count;
  return added + more;
end $$;
revoke all on function link_dict_entries(text, bigint[]) from public, anon, authenticated;
