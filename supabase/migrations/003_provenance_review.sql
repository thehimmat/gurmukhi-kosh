-- 003_provenance_review.sql
-- Adds a uniform provenance + review model to every enrichment table, so each
-- datum records where it came from (scraped / imported / rule_derived / computed
-- / ai_draft / human_verified) and how far it is through review. Also widens
-- word_grammar (verb person/form, rule provenance, confidence) and lexemes
-- (lemmas that are not SGGS surface forms) for the deep-dictionary work.
--
-- Idempotent: safe to re-run (guards on columns, constraints, indexes).

-- Common provenance/review columns on the five existing enrichment tables.
do $$
declare
  t   text;
  tables text[] := array['definitions', 'etymology', 'word_grammar', 'lexemes', 'word_forms'];
begin
  foreach t in array tables loop
    execute format('alter table %I add column if not exists provenance     text not null default ''scraped''',    t);
    execute format('alter table %I add column if not exists review_status  text not null default ''unreviewed''', t);
    execute format('alter table %I add column if not exists reviewed_by    text',        t);
    execute format('alter table %I add column if not exists reviewed_at    timestamptz', t);
    execute format('alter table %I add column if not exists curation_note  text',        t);

    if not exists (select 1 from pg_constraint where conname = t || '_provenance_chk') then
      execute format(
        'alter table %I add constraint %I check (provenance in (''scraped'',''imported'',''rule_derived'',''computed'',''ai_draft'',''human_verified''))',
        t, t || '_provenance_chk');
    end if;

    if not exists (select 1 from pg_constraint where conname = t || '_review_status_chk') then
      execute format(
        'alter table %I add constraint %I check (review_status in (''unreviewed'',''approved'',''needs_work'',''rejected''))',
        t, t || '_review_status_chk');
    end if;

    -- Curation-queue index: rows still awaiting review.
    execute format(
      'create index if not exists %I on %I (review_status) where review_status = ''unreviewed''',
      t || '_unreviewed_idx', t);
  end loop;
end $$;

-- word_grammar: Sahib Singh analyses carry verb person/form, and rule-derived
-- candidates need a rule code + confidence so the UI can rank and the curator filter.
alter table word_grammar add column if not exists rule_code  text;
alter table word_grammar add column if not exists confidence real;
alter table word_grammar add column if not exists person     text;   -- '1','2','3' for verbs
alter table word_grammar add column if not exists verb_form  text;   -- 'imperative','present','past participle', etc.

-- lexemes: a root may be a Sanskrit/Persian lemma that is NOT an SGGS surface form,
-- so root_word_id becomes optional and we store the lemma directly.
alter table lexemes alter column root_word_id drop not null;
alter table lexemes add column if not exists lemma_gurmukhi text;
alter table lexemes add column if not exists lemma_roman    text;
