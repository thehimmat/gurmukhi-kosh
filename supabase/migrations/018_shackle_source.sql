-- 018_shackle_source.sql
-- Registers Christopher Shackle, "A Guru Nanak Glossary" (2nd ed., 2011) as a
-- dictionary source and adds the schema its richer data model needs:
--   * standalone off-corpus lemmas (the glossary is base/citation forms; ~19% of
--     main entries + the whole 1,226-word Later-Gurus appendix are NOT SGGS
--     surface forms, so they can't hang off an existing corpus `words` row)
--   * a per-word spelling-verification status (so we can ingest now and verify
--     the OCRed / derived Gurmukhi later — see issue #6)
--   * etymology fields Shackle carries that we don't yet model (CDIAL number,
--     doublets, hypothetical/doubtful markers)
--   * example quotations with their AG citation sigla (references.json) and the
--     abbreviation/sign vocab (mappings.json) as lookup tables
--
-- Licensing: modern copyrighted scholarly work, © Christopher Shackle. Used per
-- the same proceed-and-acknowledge posture as SikhRI: free, strictly
-- non-commercial, attributed on /about, takedown-proof. Every Shackle datum is
-- dict_source-scoped (definitions/grammar/etymology/examples) AND every
-- off-corpus word it introduces carries origin_source='shackle', so removal on
-- request is a bounded set of scoped deletes.

-- ---------------------------------------------------------------------------
-- 1. Source registration
-- ---------------------------------------------------------------------------
insert into dict_sources (code, name, language, url, notes) values
  ('shackle', 'A Guru Nanak Glossary (Christopher Shackle)', 'en',
   'https://www.routledge.com/A-Guru-Nanak-Glossary/Shackle/p/book/9780728603431',
   'Shackle, C. A Guru Nanak Glossary, 2nd ed. (2011). Scholarly glossary of Guru Nanak''s vocabulary: English glosses + grammar + etymology + AG example citations. Modern copyrighted work; used non-commercially with attribution, removable on request. Headwords are base/citation forms; Shackle''s romanization is stored internally for cross-referencing and is NOT surfaced to users.')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- 2. words: support off-corpus lemmas + spelling verification
-- ---------------------------------------------------------------------------
-- in_corpus=false  → this word form does not occur in the ingested SGGS corpus;
--                    it exists because a dictionary lists it as a headword.
--                    frequency stays 0 and /browse (frequency-sorted corpus
--                    list) filters these out; search + word pages still serve them.
alter table words
  add column if not exists in_corpus boolean not null default true;

-- origin_source: dict_source code that introduced an OFF-corpus word (null for
-- corpus words). Makes takedown a single scoped delete of orphan lemmas.
alter table words
  add column if not exists origin_source text;

-- spelling_status: verification state of this word's Gurmukhi spelling.
--   null                       → corpus word (spelling comes from SGGS itself)
--   'corpus_matched'           → dict headword whose printed Gurmukhi exact-
--                                matched a corpus word (corroborated by SGGS)
--   'unverified_ocr'           → OCRed Gurmukhi from the book, no corpus match
--   'derived_transliteration'  → no Gurmukhi in source (appendix); we generated
--                                it from Shackle's romanization rules
-- This column IS the verification worklist for issue #6.
alter table words
  add column if not exists spelling_status text
  check (spelling_status in ('corpus_matched','unverified_ocr','derived_transliteration'));

-- roman_shackle: Shackle's own transcription (full diacritics). Internal cross-
-- reference / verification handle only; NOT rendered in the UI.
alter table words
  add column if not exists roman_shackle text;

create index if not exists words_in_corpus on words (in_corpus);
create index if not exists words_origin_source on words (origin_source) where origin_source is not null;
create index if not exists words_spelling_status on words (spelling_status) where spelling_status is not null;

-- ---------------------------------------------------------------------------
-- 3. etymology: fields Shackle carries that we don't yet model
-- ---------------------------------------------------------------------------
-- (language→origin_language, sourceForm→root_form_roman, raw→source_text already
--  map onto existing columns.)
alter table etymology
  add column if not exists cdial integer;                         -- Turner CDIAL headword number
alter table etymology
  add column if not exists is_hypothetical boolean not null default false;  -- leading * on the source form
alter table etymology
  add column if not exists doubtful text not null default 'no'
  check (doubtful in ('no','doubtful','very-doubtful'));          -- ? / ??
alter table etymology
  add column if not exists doublet_of text[];                     -- =FOO  (etymological doublet)
alter table etymology
  add column if not exists compare_forms text[];                  -- cf. FOO
-- source_code lets a multi-source table scope idempotent/takedown deletes the
-- way word_grammar already does (etymology has no dict_source_id).
alter table etymology
  add column if not exists source_code text;
create index if not exists etymology_source_code on etymology (source_code) where source_code is not null;

-- ---------------------------------------------------------------------------
-- 4. Controlled-vocabulary lookup tables (references.json + mappings.json)
--    Kept as FK targets so citation sigla / pos codes resolve without flattening
--    the book's own expansions into the data.
-- ---------------------------------------------------------------------------
create table if not exists citation_sigla (
  source_code text not null references dict_sources(code) on delete cascade,
  siglum      text not null,             -- 'AsV', 'MrS', ...
  title       text,                      -- resolved work title
  ag_pages    text,                      -- Adi Granth page range for the work
  dagger      boolean not null default false,
  created_at  timestamptz default now(),
  primary key (source_code, siglum)
);

create table if not exists dict_mappings (
  source_code text not null references dict_sources(code) on delete cascade,
  category    text not null,             -- 'pos' | 'case' | 'language' | 'sign' | 'superscript' | 'author'
  key         text not null,             -- 'm.', 'v.t.', '†', 'M2', ...
  expansion   text not null,             -- 'masculine noun', 'Guru Angad', ...
  created_at  timestamptz default now(),
  primary key (source_code, category, key)
);

-- ---------------------------------------------------------------------------
-- 5. dict_examples: external dictionary example quotations with AG citations
--    (Shackle's examples[] — romanized AG quotations, hidden-roman by policy but
--     the English translation + citation are user-facing "attested at ..." data.)
-- ---------------------------------------------------------------------------
create table if not exists dict_examples (
  id              bigserial primary key,
  word_id         bigint not null references words(id) on delete cascade,
  definition_id   bigint references definitions(id) on delete set null,
  dict_source_id  bigint not null references dict_sources(id),
  order_index     int not null default 1,
  quote_roman     text,                  -- romanized quotation (internal / hidden)
  translation     text,                  -- English rendering if printed (user-facing)
  citation_raw    text,                  -- 'AsV23.1 (M2)'
  citation_siglum text,                  -- FK-ish into citation_sigla(source_code,siglum)
  citation_hymn   text,
  citation_verse  text,
  citation_author text,
  -- provenance/review columns to match the Curated model used elsewhere
  provenance      text,
  review_status   text,
  created_at      timestamptz default now()
);
create index if not exists dict_examples_word_id on dict_examples (word_id);
create index if not exists dict_examples_source on dict_examples (dict_source_id);
