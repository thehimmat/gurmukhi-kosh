-- 010_line_translations.sql
-- Multiple per-line translations / commentaries (teekas) and Sahib Singh's
-- pad-arth, each cited to its source, so the word page and ang view can show them
-- side by side and readers can compare nuances themselves. Sourced from the BaniDB
-- v2 API (which we already integrate). Originals are stored VERBATIM in their
-- Punjabi/Gurmukhi; we do NOT machine-translate the older exegetical commentaries.
-- Idempotent.

create table if not exists translation_sources (
  code       text primary key,
  name       text not null,
  author     text,
  language   text not null,                          -- 'pa' | 'en'
  kind       text not null default 'translation'     -- 'translation' | 'teeka' | 'padarth'
             check (kind in ('translation', 'teeka', 'padarth')),
  url        text,
  notes      text,                                   -- caveats about the source (e.g. archaic language)
  created_at timestamptz default now()
);

create table if not exists line_translations (
  id            bigserial primary key,
  line_id       bigint not null references lines(id) on delete cascade,
  source_code   text not null references translation_sources(code),
  language      text not null,
  body_unicode  text not null,                       -- verbatim translation/commentary text
  provenance    text not null default 'imported'
                check (provenance in ('scraped','imported','rule_derived','computed','ai_draft','human_verified')),
  review_status text not null default 'unreviewed',
  caveat        text,                                -- per-row note when there is any doubt/guesswork
  created_at    timestamptz default now(),
  unique (line_id, source_code)
);
create index if not exists line_translations_line_id on line_translations (line_id);

alter table translation_sources enable row level security;
alter table line_translations  enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='translation_sources' and policyname='public read translation_sources') then
    create policy "public read translation_sources" on translation_sources for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='line_translations' and policyname='public read line_translations') then
    create policy "public read line_translations" on line_translations for select using (true);
  end if;
end $$;

-- Source registry. Attribution confirmed from the BaniDB v2 API response keys:
--   pu.ss = Sahib Singh (Darpan arth), pu.pss = Sahib Singh pad-arth,
--   pu.ft = Faridkot Teeka, pu.ms = Manmohan Singh (Punjabi), en.ms = Manmohan Singh (English).
-- (en.bdb / en.ssk are the BaniDB / Sant Singh Khalsa English already shown as the
--  primary translation, and pu.bdb duplicated pu.ss, so those are not re-ingested here.)
insert into translation_sources (code, name, author, language, kind, url, notes) values
  ('ss_darpan',  'Sri Guru Granth Sahib Darpan', 'Prof. Sahib Singh', 'pa', 'translation',
   'https://www.gurugranthdarpan.net/', 'Per-line meaning (arth) in modern Punjabi.'),
  ('ss_padarth', 'Darpan pad-arth (word meanings)', 'Prof. Sahib Singh', 'pa', 'padarth',
   'https://www.gurugranthdarpan.net/', 'Word-by-word glosses; may include grammatical notes in prose.'),
  ('faridkot',   'Faridkot Teeka', 'Sant Giani Badan Singh Ji and others (1928)', 'pa', 'teeka',
   null, 'Older Sikh exegetical Punjabi (Braj-influenced) with classical concepts; shown in the original, not translated.'),
  ('manmohan_pa','Shabadarth (Punjabi)', 'Bhai Manmohan Singh (SGPC)', 'pa', 'translation',
   null, 'Per-line Punjabi translation.'),
  ('manmohan_en','English translation', 'Bhai Manmohan Singh (SGPC)', 'en', 'translation',
   null, 'Per-line English translation.')
on conflict (code) do update set
  name=excluded.name, author=excluded.author, language=excluded.language,
  kind=excluded.kind, url=excluded.url, notes=excluded.notes;
