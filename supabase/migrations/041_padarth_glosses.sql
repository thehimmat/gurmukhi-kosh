-- 041_padarth_glosses.sql
-- Sahib Singh's pad-arth gloss list as rows (#165). line_translations holds each
-- line's pad-arth (source_code='ss_padarth') as one verbatim block; this splits
-- it into one row per glossed term, links each to the word occurrences it
-- glosses, and keeps the case evidence read from the gloss separately so it can
-- be suppressed or promoted on its own (#23 tier 2: evidence, not a verdict).
--
-- Written only by pipeline/padarth/ingest-glosses.ts, which replaces every row
-- for its source. Keyed on lines.id, never verse_id (#162).
-- Idempotent.

-- One row per term (kind 'entry') or per sentence before the first term
-- (kind 'note'), in source order. term / gloss / notes are verbatim.
create table if not exists padarth_glosses (
  id            bigserial primary key,
  line_id       bigint not null references lines(id) on delete cascade,
  source_code   text not null references translation_sources(code),
  ordinal       int not null,
  kind          text not null check (kind in ('entry', 'note')),
  term          text,
  gloss         text not null,
  notes         text[] not null default '{}',
  is_phrase     boolean not null default false,
  provenance    text not null default 'imported'
                check (provenance in ('scraped','imported','rule_derived','computed','ai_draft','human_verified')),
  review_status text not null default 'unreviewed',
  created_at    timestamptz default now(),
  unique (line_id, source_code, ordinal),
  check ((kind = 'entry') = (term is not null))
);
create index if not exists padarth_glosses_line_id on padarth_glosses (line_id);
create index if not exists padarth_glosses_source_code on padarth_glosses (source_code);

comment on table padarth_glosses is
  'Pad-arth split into glossed terms (#165). Rows stay on the line the source files them under; a term not found on that line is kept unlinked.';

-- Which words of the line a gloss covers. exact / gapped: the term''s words are
-- in the line. via_base: a single-word term in another form, tied to a word of
-- the line by a shared Shackle lexeme (word_forms, #18), recorded in lexeme_id.
-- The link goes when its lexeme does; re-run the pad-arth ingest after the
-- Shackle form links are rebuilt.
create table if not exists padarth_gloss_occurrences (
  gloss_id           bigint not null references padarth_glosses(id) on delete cascade,
  word_occurrence_id bigint not null references word_occurrences(id) on delete cascade,
  match              text not null check (match in ('exact', 'gapped', 'via_base')),
  lexeme_id          bigint references lexemes(id) on delete cascade,
  primary key (gloss_id, word_occurrence_id),
  check ((match = 'via_base') = (lexeme_id is not null))
);
create index if not exists padarth_gloss_occurrences_occurrence on padarth_gloss_occurrences (word_occurrence_id);

-- Case read from the postposition that closes the gloss (lib/padarth/case-evidence.ts).
-- The gloss is Sahib Singh''s; the reading is ours, hence 'computed' and the
-- cited basis.
create table if not exists padarth_case_evidence (
  id            bigserial primary key,
  gloss_id      bigint not null references padarth_glosses(id) on delete cascade,
  gram_case     text not null
                check (gram_case in ('genitive','locative','instrumental','ablative','objective','agentive','vocative')),
  marker        text not null,
  basis         text not null,
  provenance    text not null default 'computed'
                check (provenance in ('scraped','imported','rule_derived','computed','ai_draft','human_verified')),
  review_status text not null default 'unreviewed',
  unique (gloss_id, gram_case)
);

alter table padarth_glosses           enable row level security;
alter table padarth_gloss_occurrences enable row level security;
alter table padarth_case_evidence     enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'padarth_glosses' and policyname = 'public read padarth_glosses') then
    create policy "public read padarth_glosses" on padarth_glosses for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'padarth_gloss_occurrences' and policyname = 'public read padarth_gloss_occurrences') then
    create policy "public read padarth_gloss_occurrences" on padarth_gloss_occurrences for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'padarth_case_evidence' and policyname = 'public read padarth_case_evidence') then
    create policy "public read padarth_case_evidence" on padarth_case_evidence for select using (true);
  end if;
end $$;
