-- 069: curator-only sources (#258).
--
-- Sources that need a rights holder's permission are ingested for the curator's own research and
-- hidden from the public until permission arrives. `source_rights` holds, per source code, whether
-- its data is public or curator-only. The code is the one already used across the schema:
-- dict_sources.code, translation_sources.code and the `source_code` columns.
--
-- RLS on every sourced table hides curator-only rows from the API roles (anon, authenticated). The
-- curator reads through the service role, which bypasses RLS (lib/curator.ts). A code with no
-- `source_rights` row is hidden: a newly crawled source is never public by accident. A NULL
-- `source_code` (rows we derived ourselves, such as etymology chains from Mahan Kosh) stays public.
--
-- `words` keeps its `true` policy on purpose: any other policy stops the planner from using the
-- trigram / LIKE indexes for non-leakproof search operators (≈7 ms → 180 ms per search as anon). Its
-- Shackle-derived columns are withheld by column grant instead, and the apps hide off-corpus words
-- whose origin_source is curator-only (lib/curator.ts publicOriginFilter, the word page).
--
-- Releasing a source is one update:
--   update source_rights set visibility = 'public', rights_status = 'permitted', licence = '…'
--    where code = '…';

create table if not exists source_rights (
  code          text primary key,
  visibility    text not null default 'curator' check (visibility in ('public', 'curator')),
  rights_status text not null default 'unknown'
                check (rights_status in ('pd', 'open', 'permitted', 'own', 'pending', 'per_word', 'unknown')),
  licence       text,
  outreach_issue int,          -- GitHub issue tracking the permission request (#258's sub-issues)
  notes         text,
  updated_at    timestamptz not null default now()
);

alter table source_rights enable row level security;
drop policy if exists "public read source_rights" on source_rights;
create policy "public read source_rights" on source_rights for select using (true);
-- The API roles see which codes are public and nothing else (not the notes or outreach issue).
revoke all on source_rights from anon, authenticated;
grant select (code, visibility) on source_rights to anon, authenticated;

insert into source_rights (code, visibility, rights_status, outreach_issue, notes) values
  ('mahan_kosh',       'public',  'pd',      null, 'Bhai Kahn Singh Nabha (d. 1938); 1930 text'),
  ('mahan_kosh_1930',  'public',  'pd',      null, '1930 first-edition scan'),
  ('manual',           'public',  'own',     null, 'Our own annotations'),
  ('faridkot',         'public',  'pd',      null, 'Faridkot teeka'),
  ('manmohan_en',      'public',  'unknown', null, 'Via BaniDB; rights not yet checked'),
  ('manmohan_pa',      'public',  'unknown', null, 'Via BaniDB; rights not yet checked'),
  ('ssk_en',           'public',  'unknown', null, 'Via BaniDB; rights not yet checked'),
  ('shackle',          'curator', 'pending', 39,   'A Guru Nanak Glossary; curator-only while the request is pending (2026-10-21)'),
  ('sikhri',           'curator', 'pending', 40,   'SikhRI reviewing; curator-only crawl agreed 2026-10-21'),
  ('mahan_kosh_en_pu', 'curator', 'pending', 260,  'Punjabi University English Mahan Kosh'),
  ('ss_darpan',        'curator', 'pending', 264,  'Prof. Sahib Singh, Darpan; rights holder unconfirmed'),
  ('ss_padarth',       'curator', 'pending', 264,  'Prof. Sahib Singh, Darpan pad-arth; rights holder unconfirmed')
on conflict (code) do nothing;

-- Codes the API roles may see. Inlined into each policy as a hashed subplan; source_rights is tiny.
-- (A view, not a function: a SQL function in a policy is not always inlined.)
create or replace view public_source_codes with (security_invoker = true) as
  select code from source_rights where visibility = 'public';
revoke all on public_source_codes from anon, authenticated;
grant select on public_source_codes to anon, authenticated;

-- ── Tables keyed by dict_sources.id ────────────────────────────────────────────
drop policy if exists "public read definitions" on definitions;
create policy "public read definitions" on definitions for select using (
  dict_source_id in (select d.id from dict_sources d where d.code in (select code from public_source_codes))
);

drop policy if exists "public read dict_examples" on dict_examples;
create policy "public read dict_examples" on dict_examples for select using (
  dict_source_id in (select d.id from dict_sources d where d.code in (select code from public_source_codes))
);

-- ── Tables with a source_code column ──────────────────────────────────────────
drop policy if exists "public read etymology" on etymology;
create policy "public read etymology" on etymology for select using (
  source_code is null or source_code in (select code from public_source_codes)
);

drop policy if exists "public read word_grammar" on word_grammar;
create policy "public read word_grammar" on word_grammar for select using (
  source_code is null or source_code in (select code from public_source_codes)
);

drop policy if exists "public read word_forms" on word_forms;
create policy "public read word_forms" on word_forms for select using (
  source_code is null or source_code in (select code from public_source_codes)
);

drop policy if exists "public read lexeme_citations" on lexeme_citations;
create policy "public read lexeme_citations" on lexeme_citations for select using (
  source_code in (select code from public_source_codes)
);

drop policy if exists "public read lexeme_relations" on lexeme_relations;
create policy "public read lexeme_relations" on lexeme_relations for select using (
  source_code in (select code from public_source_codes)
);

drop policy if exists "public read citation_sigla" on citation_sigla;
create policy "public read citation_sigla" on citation_sigla for select using (
  source_code in (select code from public_source_codes)
);

drop policy if exists "public read dict_mappings" on dict_mappings;
create policy "public read dict_mappings" on dict_mappings for select using (
  source_code in (select code from public_source_codes)
);

drop policy if exists "public read pos_mappings" on pos_mappings;
create policy "public read pos_mappings" on pos_mappings for select using (
  source_code in (select code from public_source_codes)
);

drop policy if exists "public read line_translations" on line_translations;
create policy "public read line_translations" on line_translations for select using (
  source_code in (select code from public_source_codes)
);

drop policy if exists "public read padarth_glosses" on padarth_glosses;
create policy "public read padarth_glosses" on padarth_glosses for select using (
  source_code in (select code from public_source_codes)
);

-- ── Tables hung on another sourced table ──────────────────────────────────────
-- These subqueries run under the caller's RLS, so they see only the parent rows the caller may see.
drop policy if exists "public read padarth_gloss_occurrences" on padarth_gloss_occurrences;
create policy "public read padarth_gloss_occurrences" on padarth_gloss_occurrences for select using (
  exists (select 1 from padarth_glosses g where g.id = gloss_id)
);

drop policy if exists "public read padarth_case_evidence" on padarth_case_evidence;
create policy "public read padarth_case_evidence" on padarth_case_evidence for select using (
  exists (select 1 from padarth_glosses g where g.id = gloss_id)
);

-- A lexeme is public through at least one public citation. Every lexeme today is Shackle's.
drop policy if exists "public read lexemes" on lexemes;
create policy "public read lexemes" on lexemes for select using (
  exists (select 1 from lexeme_citations c where c.lexeme_id = lexemes.id)
);

-- ── words ─────────────────────────────────────────────────────────────────────
-- The policy stays `true` (see the header). Shackle-derived columns are withheld by column grant:
-- his romanization and page, the Gurmukhi spelling we reverse-transliterated from it, and the
-- curator's spelling-review note. A column added to words later needs its own grant to the API
-- roles (tests/db/source-visibility).
revoke select on words from anon, authenticated;
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'words'
     and column_name not in ('roman_shackle', 'shackle_page', 'spelling_candidate', 'spelling_review_note');
  execute format('grant select (%s) on words to anon, authenticated', cols);
end $$;

-- ── Other ways in ───────────────────────────────────────────────────────────────
-- Materialized views ignore RLS. Nothing public reads these two: word_source_stats counts each
-- word's definitions per source, word_stem_groups lists every headword (off-corpus Shackle ones too).
revoke select on word_source_stats from anon, authenticated;
revoke select on word_stem_groups from anon, authenticated;

-- 050 runs this as its owner (for the partial index), so it must apply the visibility itself.
create or replace function definitions_with_pua(p_source_code text, p_limit int default 200)
returns table(id bigint, sense_number int, definition_text text)
language sql stable
security definer
set search_path = public, pg_temp
as $$
  select d.id::bigint, d.sense_number::int, d.definition_text
  from definitions d
  where d.dict_source_id = (
          select s.id from dict_sources s
            join source_rights r on r.code = s.code and r.visibility = 'public'
           where s.code = p_source_code)
    and d.definition_text ~ U&'[\E000-\F8FF]'
  order by d.id
  limit p_limit
$$;
