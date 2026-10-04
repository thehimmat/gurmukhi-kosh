-- 037_archive_inferred_grammar.sql
-- "No guessing" (#30, decided 2026-10-03): the dictionary shows grammar only
-- where a source states it. Where no source gives a value, the entry is blank.
--
-- Retired, because each one infers from a word's spelling rather than reading a
-- source:
--   - the Viakaran ending rules (AUNKAR_NOM_SG, SIHARI_OBL_SG, MUKTA_OBL_SG,
--     VERB_INFINITIVE, VERB_VERBAL_NOUN), which set case/number/gender/verb form
--     from a word's final vowel sign. An ending alone underdetermines the
--     reading (#21, #27, #54, #117).
--   - the POS carried over to a word from a similarly spelled one ("inherited
--     from lemma"), and the lexeme / word_forms grouping by shared consonant stem.
--
-- Kept, because it is read from a source: the part of speech each Mahan Kosh
-- sense states in its own marker. Those rows are relabelled to say so
-- (provenance 'scraped', source_code 'mahan_kosh', matching Mahan Kosh
-- definitions), with the inferred values stripped from them.
--
-- The inferred data is kept, not deleted, in *_inferred_archive tables. They
-- have RLS enabled and NO policy, and anon/authenticated are revoked, so no app
-- query can surface an archived guess. Each row keeps its original id plus
-- when and why it was archived; stripped rows are archived as they were before
-- the strip, so the live table can be restored from the archive if ever needed.
--
-- Also dismisses the automated "doubt" flags, which all targeted readings from
-- the unverified ending rules. Conflict flags are left to the autoflag pass
-- (npm run ingest:grammar:autoflag), which recomputes them from the grammar view.
--
-- Idempotent: archives are keyed on the original id, and every write filters on
-- the inferred shape, which no longer exists after the first run.

-- 1. Archive tables.
create table if not exists word_grammar_inferred_archive (
  like word_grammar,
  archived_at    timestamptz not null default now(),
  archive_reason text not null,
  primary key (id)
);
create table if not exists word_forms_inferred_archive (
  like word_forms,
  archived_at    timestamptz not null default now(),
  archive_reason text not null,
  primary key (id)
);
create table if not exists lexemes_inferred_archive (
  like lexemes,
  archived_at    timestamptz not null default now(),
  archive_reason text not null,
  primary key (id)
);

alter table word_grammar_inferred_archive enable row level security;
alter table word_forms_inferred_archive   enable row level security;
alter table lexemes_inferred_archive      enable row level security;
-- Deliberately no policies: archived inference is never served to readers.
revoke all on word_grammar_inferred_archive from anon, authenticated;
revoke all on word_forms_inferred_archive   from anon, authenticated;
revoke all on lexemes_inferred_archive      from anon, authenticated;

-- 2. word_grammar: POS carried over from a similarly spelled word. The POS
--    itself is the guess, so the whole row goes to the archive.
insert into word_grammar_inferred_archive
select wg.*, now(), 'pos_inherited_by_shared_stem'
from word_grammar wg
where wg.provenance = 'rule_derived' and wg.notes like '%inherited from lemma%'
on conflict (id) do nothing;

delete from word_grammar
where provenance = 'rule_derived' and notes like '%inherited from lemma%';

-- 3. word_grammar: every remaining rule_derived row is a Mahan Kosh POS row,
--    some carrying ending-rule values. Snapshot each as it was, then keep only
--    the POS and attribute it to Mahan Kosh.
insert into word_grammar_inferred_archive
select wg.*, now(), 'mahan_kosh_pos_row_before_ending_rules_stripped'
from word_grammar wg
where wg.provenance = 'rule_derived'
on conflict (id) do nothing;

update word_grammar set
  gender      = null,
  number      = null,
  gram_case   = null,
  person      = null,
  verb_form   = null,
  rule_code   = null,
  confidence  = null,
  notes       = null,
  provenance  = 'scraped',
  source_code = 'mahan_kosh'
where provenance = 'rule_derived';

-- 4. Stem grouping: word_forms memberships no source asserts, and the
--    rule_derived lexemes they hung from. Archive memberships before lexemes
--    (deleting a lexeme cascades to its word_forms).
insert into word_forms_inferred_archive
select wf.*, now(), 'grouped_by_shared_stem'
from word_forms wf
where wf.source_code is null
on conflict (id) do nothing;

delete from word_forms where source_code is null;

insert into lexemes_inferred_archive
select l.*, now(), 'grouped_by_shared_stem'
from lexemes l
where l.provenance = 'rule_derived'
on conflict (id) do nothing;

delete from lexemes l
where l.provenance = 'rule_derived'
  and not exists (select 1 from word_forms wf where wf.lexeme_id = l.id);

-- 5. Automated doubt flags: each targeted an unverified ending-rule reading.
update flags set
  status          = 'dismissed',
  resolved_at     = now(),
  resolution_note = 'Auto-dismissed: the flagged reading came from a retired Viakaran ending rule and is no longer shown (migration 037).'
where status = 'open'
  and reporter_name = 'Rule engine (automated)'
  and flag_type = 'unclear'
  and target_table = 'word_grammar';
