-- 032: numbers as a searchable, role-tagged index.
--
-- Gurmukhi numerals are absent from the dictionary entirely: lib/tokenizer.ts
-- keeps only tokens carrying a Gurmukhi LETTER, so ੧ and ॥੧॥ never became
-- words and never got word_occurrences rows. Searching "੧" therefore matched
-- nothing but a handful of mis-tokenized Dasam compounds (੧੨੮॥੨੫੨੩॥ਅਫਜੂੰ).
--
-- Numbers are indexed here rather than by loosening the tokenizer on purpose.
-- Admitting digits as words would renumber every existing
-- word_occurrences.position (they are token offsets), force a re-ingest of all
-- three corpora, and put thousands of numeral "words" into browse, frequency
-- and the dictionary surfaces — none of which have an entry to show. A
-- numeral is not a lexeme; it is a structural marker, so it gets its own
-- index, and lines/words/word_occurrences are untouched.
--
-- `role` is what makes the index worth having. The overwhelming majority of
-- numerals are verse tallies (॥੧॥, ॥੪॥੪॥੧੬॥) closing a pauri or shabad; the
-- useful minority identify the composition (ਮਹਲਾ ੫, ਘਰੁ ੨, ਪਾਤਿਸਾਹੀ ੧੦).
-- Storing the role precomputed keeps the default search — headings only,
-- tallies hidden — a single indexed predicate instead of a scan over
-- lines.gurmukhi.
--
-- Roles are assigned by lib/gurmukhi-numerals.ts (extractNumerals), which owns
-- the rules and is the only writer; pipeline/numbers/populate.ts rebuilds this
-- table from lines. The check constraint below mirrors NUMERAL_ROLES there —
-- adding a role means changing both.

create table if not exists number_occurrences (
  id bigserial primary key,
  line_id bigint not null references lines(id) on delete cascade,
  -- The integer value, not the glyphs: a query typed "10" on a Latin keyboard
  -- and one typed "੧੦" must find the same rows.
  value integer not null,
  role text not null check (role in ('author', 'ghar', 'heading_other', 'verse_marker')),
  -- The heading keyword the role was read from (ਮਹਲਾ, ਘਰੁ, ...), null for
  -- verse markers and unkeyed heading numbers. Kept for display and so a
  -- misclassification can be traced back to the word that caused it.
  keyword text,
  -- Character offsets of the numeral within lines.gurmukhi, for highlighting.
  char_start integer not null,
  char_end integer not null,
  -- One numeral per starting offset per line; makes the rebuild idempotent.
  unique (line_id, char_start)
);

-- The search predicate: value first, then the role filter, then read the line.
create index if not exists idx_numocc_value_role on number_occurrences (value, role);
create index if not exists idx_numocc_line on number_occurrences (line_id);
-- Counting hits per role to label the checkboxes touches role alone.
create index if not exists idx_numocc_role on number_occurrences (role);

alter table number_occurrences enable row level security;
create policy "public read number_occurrences" on number_occurrences
  for select using (true);
