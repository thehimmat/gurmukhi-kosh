-- Filed from the server ledger (supabase_migrations.schema_migrations 20261019150700,
-- mk_collation_review_tables), verbatim. Applied 2026-10-19 with no repo file (#253).
-- Mahan Kosh collation: staging + review. Never writes to definitions.
create table public.mk_runs (
  id bigserial primary key,
  section text not null,                -- e.g. 'ura' (ੳ)
  en_volume int,
  started_at timestamptz default now(),
  finished_at timestamptz,
  stats jsonb default '{}'::jsonb,
  notes text
);
create table public.mk_alignments (
  id bigserial primary key,
  run_id bigint references public.mk_runs(id) on delete cascade,
  section text not null,
  seq int not null,                      -- order within section
  pa_head text not null,
  pa_page int,                           -- page in Language Dept / Rara Sahib PDF
  pa_text text,
  en_translit text,
  en_volume int,
  en_page int,
  en_text text,
  ed1930_page text,                      -- archive.org leaf when checked
  ed1930_text text,
  word_id bigint references public.words(id),
  align_score real,
  mech_issues jsonb default '[]'::jsonb,
  llm_reviewed boolean default false,
  created_at timestamptz default now(),
  unique (section, seq, en_volume)
);
create table public.mk_discrepancies (
  id bigserial primary key,
  alignment_id bigint references public.mk_alignments(id) on delete cascade,
  kind text not null check (kind in ('mistranslation','omission','addition','transliteration','muddled','alignment','db_digitization','edition_drift','other')),
  severity text not null check (severity in ('high','medium','low')),
  pa_excerpt text,
  en_excerpt text,
  explanation text,
  suggested_en text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','needs_info')),
  reviewer_note text,
  reviewed_at timestamptz,
  created_at timestamptz default now()
);
create index on public.mk_alignments (section, seq);
create index on public.mk_discrepancies (status, severity);
alter table public.mk_runs enable row level security;
alter table public.mk_alignments enable row level security;
alter table public.mk_discrepancies enable row level security;
insert into public.dict_sources (code,name,language,url,notes) values
 ('mahan_kosh_en_pu','Encyclopaedia of Sikh Literature (English Mahan Kosh), Punjabi University, Vols 1-3, 2006-2011','en','https://www.gurmatveechar.com/books/English_Books/Bhai_Kahan_Singh_Nabha/','Staging only (mk_* tables). Copyrighted: non-commercial, attribution, removable on request. Vol 4 withdrawn by publisher.'),
 ('mahan_kosh_1930','Gur Shabad Ratnakar Mahan Kosh, 1st edition 1930 (scan)','pa','https://archive.org/details/mahan-kosh-1930-first-edition-volume-1-by-kahn-singh-of-nabha','Used for edition-drift checks on flagged entries. Vols 1-2 on archive.org; 3-4 not located.')
on conflict do nothing;
