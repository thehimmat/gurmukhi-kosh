-- 059: passages, the units a bani is read in (#219), from BaniDB's banis.
--
-- A shabad is how BaniDB files the text; a passage is how a bani is read:
-- Japji's first shabad holds the Mul Mantar, ॥ਜਪੁ॥, the salok and Pauri 1,
-- and its banis endpoint gives each its own paragraph. pipeline/passages
-- matches each paragraph to our lines (lib/passages.ts); the viewer opens a
-- line in the smallest passage holding it, or its shabad if that's smaller.
--
-- A passage is a contiguous verse range within one scripture. A paragraph
-- the bani reads with lines skipped becomes several parts.

create table if not exists banis (
  id             int primary key,      -- BaniDB's bani ID
  token          text not null,
  name_gurmukhi  text not null,
  name_english   text,
  paragraphs     int not null          -- for "5 of 43"
);

create table if not exists passages (
  id              bigserial primary key,
  bani_id         int    not null references banis(id) on delete cascade,
  ordinal         int    not null,     -- the paragraph's place in the bani, from 1
  part            int    not null default 1,
  source_fk       bigint not null references sources(id) on delete cascade,
  first_verse_id  int    not null,
  last_verse_id   int    not null,
  unique (bani_id, ordinal, part),
  check (first_verse_id <= last_verse_id)
);

-- A line's passages: those in its scripture whose range holds its verse.
create index if not exists passages_span on passages (source_fk, first_verse_id, last_verse_id);

alter table banis enable row level security;
create policy "public read banis" on banis for select using (true);
alter table passages enable row level security;
create policy "public read passages" on passages for select using (true);
