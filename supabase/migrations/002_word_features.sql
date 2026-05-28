-- 002_word_features.sql
-- Adds dictionary definitions, etymology, grammar, and morphological grouping tables.

-- Dictionary sources (separate from scripture `sources` table)
create table dict_sources (
  id          bigserial primary key,
  code        text not null unique,   -- 'mahan_kosh', 'manual', 'punjabi_uni', etc.
  name        text not null,
  language    text,                   -- primary language: 'pa', 'hi', 'sa', 'fa', 'ur', 'en'
  url         text,
  notes       text,
  ingested_at timestamptz,
  created_at  timestamptz default now()
);

-- One row per sense per dictionary per word
create table definitions (
  id              bigserial primary key,
  word_id         bigint not null references words(id) on delete cascade,
  dict_source_id  bigint not null references dict_sources(id),
  entry_gurmukhi  text,               -- headword as it appears in the dictionary
  sense_number    int,                -- ordering within a source for this word
  definition_text text not null,      -- definition in the source's language (may be Gurmukhi)
  definition_en   text,               -- English gloss (for non-English sources)
  cross_refs      jsonb,              -- {"sa": "समयः", "hi": "समय", "fa": "وقت"}
  source_url      text,
  notes           text,
  created_at      timestamptz default now()
);
create index definitions_word_id on definitions (word_id);
create unique index definitions_word_source_sense
  on definitions (word_id, dict_source_id, coalesce(sense_number, 0));

-- Etymology chain (one word can have multiple origin notes)
create table etymology (
  id              bigserial primary key,
  word_id         bigint not null references words(id) on delete cascade,
  order_index     int not null default 1,
  origin_language text not null,      -- 'Sanskrit', 'Persian', 'Arabic', 'Punjabi', etc.
  root_form       text,               -- root in source script
  root_form_roman text,               -- romanization
  derivation_note text,
  source_text     text,
  created_at      timestamptz default now()
);
create index etymology_word_id on etymology (word_id);
create unique index etymology_word_order on etymology (word_id, order_index);

-- Grammar tags (nullable link to a specific definition sense)
create table word_grammar (
  id            bigserial primary key,
  word_id       bigint not null references words(id) on delete cascade,
  definition_id bigint references definitions(id) on delete set null,
  pos           text,   -- 'noun','verb','adjective','adverb','pronoun','particle',
                        -- 'postposition','conjunction','interjection','proper noun'
  gender        text,   -- 'masculine','feminine','neuter'
  number        text,   -- 'singular','plural'
  gram_case     text,   -- 'nominative','oblique','vocative', etc.
  notes         text,
  created_at    timestamptz default now()
);
create index word_grammar_word_id on word_grammar (word_id);

-- Lexeme: canonical grouping for a set of inflected forms
create table lexemes (
  id            bigserial primary key,
  root_word_id  bigint not null references words(id),
  gloss_en      text,
  notes         text,
  created_at    timestamptz default now()
);

-- Word forms: maps each surface form to its lexeme
create table word_forms (
  id               bigserial primary key,
  lexeme_id        bigint not null references lexemes(id) on delete cascade,
  word_id          bigint not null references words(id) on delete cascade,
  inflection_desc  text,   -- 'root','past participle masc. sg.','oblique plural', etc.
  created_at       timestamptz default now()
);
create unique index word_forms_lexeme_word on word_forms (lexeme_id, word_id);
create index word_forms_word_id on word_forms (word_id);

-- RLS (same pattern as all other tables)
alter table dict_sources  enable row level security;
alter table definitions   enable row level security;
alter table etymology     enable row level security;
alter table word_grammar  enable row level security;
alter table lexemes       enable row level security;
alter table word_forms    enable row level security;

create policy "public read dict_sources"  on dict_sources  for select using (true);
create policy "public read definitions"   on definitions   for select using (true);
create policy "public read etymology"     on etymology     for select using (true);
create policy "public read word_grammar"  on word_grammar  for select using (true);
create policy "public read lexemes"       on lexemes       for select using (true);
create policy "public read word_forms"    on word_forms    for select using (true);

-- Seed default dict_sources
insert into dict_sources (code, name, language, url, notes) values
  ('mahan_kosh', 'Mahan Kosh (Bhai Kahn Singh Nabha)', 'pa',
   'https://www.searchgurbani.com/mahankosh',
   'Encyclopedic Punjabi-Punjabi dictionary, published 1930'),
  ('manual', 'Manual Annotations', 'en', null,
   'Hand-authored notes added by project contributors');
