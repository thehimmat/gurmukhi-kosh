-- Gurmukhi Kosh schema

create extension if not exists pg_trgm;

-- Unique word forms found in SGGS
create table words (
  id bigserial primary key,
  gurmukhi text not null unique,
  frequency int not null default 0,
  created_at timestamptz default now()
);

create index words_gurmukhi_trgm on words using gin (gurmukhi gin_trgm_ops);

-- Shabad (hymn) metadata from BaniDB
create table shabads (
  id int primary key,
  raag_english text,
  raag_gurmukhi text,
  writer_english text,
  writer_id int,
  ang_start int not null
);

-- Individual lines/verses from SGGS
create table lines (
  id bigserial primary key,
  verse_id int unique,
  shabad_id int references shabads(id),
  ang int not null,
  line_no int not null,
  gurmukhi text not null,
  translation_en text,
  transliteration_en text,
  source_id text not null default 'G'
);

create index lines_ang on lines (ang);
create index lines_shabad_id on lines (shabad_id);

-- Every occurrence of a word in a line
create table word_occurrences (
  id bigserial primary key,
  word_id bigint not null references words(id),
  line_id bigint not null references lines(id),
  position int not null
);

create unique index word_occurrences_unique on word_occurrences (word_id, line_id, position);
create index word_occurrences_word_id on word_occurrences (word_id);
create index word_occurrences_line_id on word_occurrences (line_id);

-- Recalculate frequencies from occurrence counts; run after ingestion completes
create or replace function refresh_word_frequencies()
returns void language sql as $$
  update words
  set frequency = (
    select count(*) from word_occurrences where word_id = words.id
  );
$$;

-- Mahan Kosh (Bhai Kahn Singh Nabha) cross-references
create table mahan_kosh_refs (
  id bigserial primary key,
  word_id bigint not null references words(id),
  entry_gurmukhi text,
  definition text,
  source_url text,
  notes text,
  created_at timestamptz default now()
);

create index mahan_kosh_refs_word_id on mahan_kosh_refs (word_id);
