-- Gurmukhi Kosh schema

create extension if not exists pg_trgm;

-- Sources: one row per ingested text / version
-- Allows multiple versions of the same scripture or entirely different texts.
-- Words are deduplicated globally; occurrences always trace back to a source.
create table sources (
  id bigserial primary key,
  code text not null unique,        -- short stable identifier, e.g. 'sggs_banidb_v2'
  name text not null,               -- human-readable display name
  version text,                     -- version string if relevant
  description text,                 -- free-form notes about this source
  ingested_at timestamptz,          -- set when ingestion completes
  created_at timestamptz default now()
);

-- Unique word forms (deduplicated across all sources)
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

-- Individual lines/verses — unique per (source, external verse id)
create table lines (
  id bigserial primary key,
  source_fk bigint not null references sources(id),
  verse_id int not null,            -- source-specific line/verse identifier
  shabad_id int references shabads(id),
  ang int not null,
  line_no int not null,
  gurmukhi text not null,
  translation_en text,
  transliteration_en text
);

-- verse_id is unique within a source, not globally
create unique index lines_source_verse_unique on lines (source_fk, verse_id);
create index lines_ang on lines (ang);
create index lines_shabad_id on lines (shabad_id);
create index lines_source_fk on lines (source_fk);

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

-- RLS: all tables are publicly readable; writes require service role key
alter table sources enable row level security;
alter table words enable row level security;
alter table shabads enable row level security;
alter table lines enable row level security;
alter table word_occurrences enable row level security;
alter table mahan_kosh_refs enable row level security;

create policy "public read sources" on sources for select using (true);
create policy "public read words" on words for select using (true);
create policy "public read shabads" on shabads for select using (true);
create policy "public read lines" on lines for select using (true);
create policy "public read word_occurrences" on word_occurrences for select using (true);
create policy "public read mahan_kosh_refs" on mahan_kosh_refs for select using (true);
