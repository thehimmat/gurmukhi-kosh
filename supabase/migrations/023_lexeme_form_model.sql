-- 023_lexeme_form_model.sql
-- Schema for the lexeme / form / occurrence model (issue #30).
--
-- Three levels of grammatical claim, kept apart so a context-dependent fact can
-- never be stored as a word-level one (the MUKTA_OBL_SG failure mode, #21):
--   lexeme     : the lemma hub and its lexical properties (pos, gender)
--   form       : features of a surface form AS A MEMBER of a lexeme (word_forms)
--   occurrence : function-in-context claims, anchored to a line (word_grammar
--                rows with source_line_id; unchanged by this migration)
--
-- Decisions recorded on #30:
--   1. The canonical unmarked-case value is 'direct' (not 'nominative', which
--      implies a sentence role that ergative objects contradict). Karak labels
--      survive verbatim in label_raw / notes / occurrence rows.
--   2. One lexeme hub per word; each source's own headword choice lives in
--      lexeme_citations, never forced into agreement.
--   3. Form rows are written only from direct sources or #21-verified rules;
--      rule-derived rows keep provenance='rule_derived' and render as marked
--      inference, never visually equal to a cited cell.
--   4. A source may assert several readings of one membership (mukta forms fill
--      both the direct-plural and oblique-singular cells), hence reading_number
--      in the uniqueness key, mirroring definitions' sense_number.
--
-- Feature columns live on word_forms (the membership), not on words, because
-- homographs carry different features per lexeme: surface form X can be the
-- locative singular of one lexeme and the absolutive of another.
-- Idempotent.

-- ---------------------------------------------------------------------------
-- 1. Decision 1: migrate the legacy case value. Rule codes keep their names;
--    only the stored value changes. Emitters updated in pipeline/grammar/.
-- ---------------------------------------------------------------------------

update word_grammar set gram_case = 'direct' where gram_case = 'nominative';

-- ---------------------------------------------------------------------------
-- 2. word_forms: membership-scoped feature columns.
--    A row means: "<source> reads surface form <word_id> as a form of lexeme
--    <lexeme_id>, with these features". Multiple rows per membership are
--    expected (one per source per reading).
-- ---------------------------------------------------------------------------

alter table word_forms add column if not exists source_code text;
alter table word_forms add column if not exists reading_number integer not null default 1;
alter table word_forms add column if not exists gram_case text
  check (gram_case in ('direct', 'oblique', 'vocative', 'locative', 'ablative'));
alter table word_forms add column if not exists gender text
  check (gender in ('masculine', 'feminine'));
alter table word_forms add column if not exists number text
  check (number in ('singular', 'plural'));
alter table word_forms add column if not exists person text
  check (person in ('first', 'second', 'third'));
alter table word_forms add column if not exists verb_form text
  check (verb_form in ('infinitive', 'gerundive', 'verbal_noun', 'absolutive',
                       'present_participle', 'past_participle'));
alter table word_forms add column if not exists tense_mood text
  check (tense_mood in ('present', 'future', 'imperative', 'subjunctive'));
alter table word_forms add column if not exists label_raw text;
alter table word_forms add column if not exists features jsonb not null default '{}'::jsonb;
alter table word_forms add column if not exists rule_code text;

comment on column word_forms.source_code is
  'Which source asserts this membership + reading (dict_sources.code convention). Null only for rule-derived rows, which must set rule_code instead.';
comment on column word_forms.reading_number is
  'Orders multiple readings one source gives the same membership; deterministic from source parse order. Part of the uniqueness key.';
comment on column word_forms.label_raw is
  'The source''s verbatim label for this reading (e.g. Shackle "pres. 3s."), always preserved alongside the normalized columns.';
comment on column word_forms.features is
  'Long-tail features that do not warrant columns yet: pronominal suffixes, -ar- extensions, style/context marks. Filled only from source extraction.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'word_forms_rule_code_fk') then
    alter table word_forms
      add constraint word_forms_rule_code_fk
      foreign key (rule_code) references grammar_rules(rule_code) on delete set null;
  end if;
end $$;

-- Uniqueness (decision 4). coalesce() folds null source_code (rule-derived
-- rows) into one bucket so they cannot silently duplicate either.
create unique index if not exists word_forms_reading_uq
  on word_forms (lexeme_id, word_id, coalesce(source_code, ''), reading_number);

create index if not exists word_forms_word_id_idx on word_forms (word_id);
create index if not exists word_forms_lexeme_id_idx on word_forms (lexeme_id);

-- ---------------------------------------------------------------------------
-- 3. lexemes: lexical properties of the lemma. The grouping itself is our
--    openly-editorial act (decision 2); pos selects which paradigm grid shape
--    the family page renders. Transitivity is folded into pos.
-- ---------------------------------------------------------------------------

alter table lexemes add column if not exists pos text
  check (pos in ('noun', 'adjective', 'verb', 'verb_transitive', 'verb_intransitive',
                 'pronoun', 'postposition', 'preposition', 'particle', 'adverb',
                 'numeral', 'interjection', 'conjunction', 'prefix', 'suffix'));
alter table lexemes add column if not exists gender text
  check (gender in ('masculine', 'feminine'));

comment on column lexemes.pos is
  'Our grouping-level judgment (the lexeme is editorial); per-source POS claims stay on word_grammar / pos_mappings.';

-- ---------------------------------------------------------------------------
-- 4. lexeme_citations: each source's own headword choice for a lexeme
--    (decision 2). Shackle heads verbs at the absolutive, others at the
--    infinitive; neither is rewritten as the other.
-- ---------------------------------------------------------------------------

create table if not exists lexeme_citations (
  lexeme_id         bigint not null references lexemes(id) on delete cascade,
  source_code       text not null,
  citation_gurmukhi text,
  citation_roman    text,
  notes             text,
  created_at        timestamptz default now(),
  primary key (lexeme_id, source_code),
  check (citation_gurmukhi is not null or citation_roman is not null)
);

alter table lexeme_citations enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'lexeme_citations' and policyname = 'public read lexeme_citations') then
    create policy "public read lexeme_citations" on lexeme_citations for select using (true);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. lexeme_relations: typed cross-lexeme links a source explicitly asserts.
--    Direction: from_lexeme is the derived/marked member, to_lexeme the base:
--      causative_of     : from = causative stem,  to = base verb
--      agent_noun_of    : from = agent noun,      to = verb
--      correlative_pair : symmetric; store once in either direction
--      see_also         : from = the entry carrying the cross-reference
--    No inferred edges: source_code is not null by design.
-- ---------------------------------------------------------------------------

create table if not exists lexeme_relations (
  id             bigserial primary key,
  from_lexeme_id bigint not null references lexemes(id) on delete cascade,
  to_lexeme_id   bigint not null references lexemes(id) on delete cascade,
  relation_type  text not null
    check (relation_type in ('causative_of', 'agent_noun_of', 'correlative_pair', 'see_also')),
  source_code    text not null,
  label_raw      text,
  notes          text,
  provenance     text not null default 'imported'
    check (provenance in ('scraped', 'imported', 'rule_derived', 'computed', 'ai_draft', 'human_verified')),
  review_status  text not null default 'unreviewed'
    check (review_status in ('unreviewed', 'approved', 'needs_work', 'rejected')),
  created_at     timestamptz default now(),
  check (from_lexeme_id <> to_lexeme_id),
  unique (from_lexeme_id, to_lexeme_id, relation_type, source_code)
);

create index if not exists lexeme_relations_from_idx on lexeme_relations (from_lexeme_id);
create index if not exists lexeme_relations_to_idx on lexeme_relations (to_lexeme_id);

alter table lexeme_relations enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'lexeme_relations' and policyname = 'public read lexeme_relations') then
    create policy "public read lexeme_relations" on lexeme_relations for select using (true);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. pos_mappings: deterministic, reviewable raw-POS -> normalized-POS table
--    (dict_mappings pattern). Read-side join on (source_code, pos_raw); a raw
--    string with no row renders raw, which is honest. Compound (semicolon)
--    strings and form-labels-as-POS (participle, imperative, present, emphatic,
--    possessive, negative) are intentionally unmapped until reviewed.
-- ---------------------------------------------------------------------------

create table if not exists pos_mappings (
  source_code text not null references dict_sources(code),
  pos_raw     text not null,
  pos_norm    text not null
    check (pos_norm in ('noun', 'adjective', 'verb', 'verb_transitive', 'verb_intransitive',
                        'pronoun', 'postposition', 'preposition', 'particle', 'adverb',
                        'numeral', 'interjection', 'conjunction', 'prefix', 'suffix')),
  created_at  timestamptz default now(),
  primary key (source_code, pos_raw)
);

alter table pos_mappings enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'pos_mappings' and policyname = 'public read pos_mappings') then
    create policy "public read pos_mappings" on pos_mappings for select using (true);
  end if;
end $$;

-- Seeds cover Shackle's single-POS raw strings observed in word_grammar.
-- "masculine, masculine noun" is one POS (noun) whose gender rides separately;
-- "masculine plural" / "feminine plural" are likewise noun-POS with features.
insert into pos_mappings (source_code, pos_raw, pos_norm) values
  ('shackle', 'masculine, masculine noun', 'noun'),
  ('shackle', 'feminine, feminine noun', 'noun'),
  ('shackle', 'masculine plural', 'noun'),
  ('shackle', 'feminine plural', 'noun'),
  ('shackle', 'adjective, adjectival', 'adjective'),
  ('shackle', 'transitive verb', 'verb_transitive'),
  ('shackle', 'intransitive verb', 'verb_intransitive'),
  ('shackle', 'substantive verb', 'verb'),
  ('shackle', 'pronoun', 'pronoun'),
  ('shackle', 'adverb, adverbial', 'adverb'),
  ('shackle', 'numeral', 'numeral'),
  ('shackle', 'postposition', 'postposition'),
  ('shackle', 'preposition', 'preposition'),
  ('shackle', 'interjection', 'interjection'),
  ('shackle', 'conjunction', 'conjunction'),
  ('shackle', 'prefix', 'prefix'),
  ('shackle', 'suffix', 'suffix')
on conflict (source_code, pos_raw) do update set pos_norm = excluded.pos_norm;
