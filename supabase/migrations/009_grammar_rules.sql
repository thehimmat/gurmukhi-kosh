-- 009_grammar_rules.sql
-- Registry that explains every grammar rule_code the engine emits: a plain-English
-- basis, a scholarly citation, a tier, and whether it has been verified against the
-- primary source. This lets the word page expose "how we determined this" and cite
-- the rule, per the project's provenance-first principle. Idempotent.
--
-- Tiers (honest about where each datum comes from):
--   codified_rule     — a codified scholarly grammar rule (Sahib Singh's Viakaran)
--   source_extraction — read directly from a source's own marker (e.g. Mahan Kosh POS)
--   heuristic         — our own engineering heuristic (e.g. stem grouping / inheritance)

create table if not exists grammar_rules (
  rule_code   text primary key,
  title       text not null,
  explanation text not null,
  citation    text,
  tier        text not null default 'codified_rule'
              check (tier in ('codified_rule', 'source_extraction', 'heuristic')),
  verified    boolean not null default false,
  created_at  timestamptz default now()
);

alter table grammar_rules enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'grammar_rules' and policyname = 'public read grammar_rules') then
    create policy "public read grammar_rules" on grammar_rules for select using (true);
  end if;
end $$;

-- Seed the Viakaran case/number/gender rules the engine currently emits.
-- verified=false on purpose: these were transcribed from knowledge of Viakaran and
-- still need page-level confirmation against the published text before we claim them.
insert into grammar_rules (rule_code, title, explanation, citation, tier, verified) values
  ('AUNKAR_NOM_SG', 'Aunkar ending → nominative singular (masculine)',
   'A noun ending in aunkar (ੁ) stands in the nominative (kartā kārak), singular, and is masculine. Determined from the word''s final laga-mātra, applied uniformly.',
   'Sahib Singh, Gurbani Viakaran (1939): kārak via laga-mātra. Pending page-level verification.',
   'codified_rule', false),
  ('SIHARI_OBL_SG', 'Sihari ending → oblique singular',
   'A noun ending in sihari (ਿ) stands in an oblique singular case (karan/adhikaran kārak — instrumental or locative sense). Determined from the word''s final laga-mātra.',
   'Sahib Singh, Gurbani Viakaran (1939). Pending page-level verification.',
   'codified_rule', false),
  ('MUKTA_OBL_SG', 'Mukta (bare) ending → oblique singular',
   'A bare noun form with no final vowel sign (mukta) is oblique singular, typically standing before a postposition (sambandhak). Determined from the word''s final laga-mātra.',
   'Sahib Singh, Gurbani Viakaran (1939). Pending page-level verification.',
   'codified_rule', false)
on conflict (rule_code) do update set
  title       = excluded.title,
  explanation = excluded.explanation,
  citation    = excluded.citation,
  tier        = excluded.tier;

-- Link word_grammar rows to the registry so the UI can embed the rule explanation.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'word_grammar_rule_code_fk') then
    alter table word_grammar
      add constraint word_grammar_rule_code_fk
      foreign key (rule_code) references grammar_rules(rule_code) on delete set null;
  end if;
end $$;
