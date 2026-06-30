-- 011_grammar_padarth.sql
-- Grammar-verification slice: turns Sahib Singh's explicit pad-arth grammar notes
-- into a citable source for word_grammar, and reconciles our (previously
-- unverified) Viakaran rules against what his Darpan actually attests.
--
--   1. Per-datum citation columns on word_grammar (source_code + source_line_id),
--      so a sourced grammar fact points at the exact pad-arth line it came from.
--   2. SS_PADARTH_* registry rules (tier source_extraction, verified): these are
--      read straight from Sahib Singh's prose, not inferred — the authority is his.
--   3. AUNKAR_NOM_SG flipped to verified: the pad-arth repeatedly attests
--      aunkar-ending words as masculine kartā kārak (ਸਾਹਿਬੁ, ਸਾਚੁ, ਵੀਚਾਰੁ, ਇਕੁ),
--      and states feminine nouns drop the aunkar even in the singular (ਹਾਥ).
--   4. SIHARI_OBL_SG left UNVERIFIED with a caveat: the pad-arth shows a
--      sihari-ending feminine noun (ਕੁਦਰਤਿ) standing as the nominative subject,
--      so "sihari → oblique" is not unconditional. Flagged for review.
-- Idempotent.

-- 1. Citation columns. source_code is free text (grammar can be sourced from
--    pad-arth today, Mahan Kosh / SikhRI later); source_line_id locates the
--    exact line the statement was read from.
alter table word_grammar add column if not exists source_code    text;
alter table word_grammar add column if not exists source_line_id bigint references lines(id) on delete set null;
create index if not exists word_grammar_source_line_id on word_grammar (source_line_id);

-- 2. Source-extraction rules for the four kinds of fact the pad-arth states.
insert into grammar_rules (rule_code, title, explanation, citation, tier, verified) values
  ('SS_PADARTH_GENDER', 'Gender stated in Sahib Singh''s pad-arth',
   'The gender (ਪੁਲਿੰਗ masculine / ਇਸਤ੍ਰੀ-ਲਿੰਗ feminine) is stated explicitly for this word in Sahib Singh''s word-by-word notes, read directly from his prose rather than inferred from the ending.',
   'Prof. Sahib Singh, Sri Guru Granth Sahib Darpan — pad-arth (word notes), per line.',
   'source_extraction', true),
  ('SS_PADARTH_NUMBER', 'Number stated in Sahib Singh''s pad-arth',
   'The number (ਇਕ-ਵਚਨ singular / ਬਹੁ-ਵਚਨ plural) is stated explicitly for this form in Sahib Singh''s word-by-word notes.',
   'Prof. Sahib Singh, Sri Guru Granth Sahib Darpan — pad-arth (word notes), per line.',
   'source_extraction', true),
  ('SS_PADARTH_POS', 'Part of speech stated in Sahib Singh''s pad-arth',
   'The part of speech (ਨਾਂਵ noun / ਵਿਸ਼ੇਸ਼ਣ adjective / ਪੜਨਾਂਵ pronoun) is tagged for this form in Sahib Singh''s word-by-word notes.',
   'Prof. Sahib Singh, Sri Guru Granth Sahib Darpan — pad-arth (word notes), per line.',
   'source_extraction', true),
  ('SS_PADARTH_CASE', 'Case stated in Sahib Singh''s pad-arth',
   'The grammatical case (e.g. ਕਰਤਾ ਕਾਰਕ nominative) is stated explicitly for this word in Sahib Singh''s word-by-word notes.',
   'Prof. Sahib Singh, Sri Guru Granth Sahib Darpan — pad-arth (word notes), per line.',
   'source_extraction', true)
on conflict (rule_code) do update set
  title=excluded.title, explanation=excluded.explanation,
  citation=excluded.citation, tier=excluded.tier, verified=excluded.verified;

-- 3. AUNKAR_NOM_SG: verified against Sahib Singh's Darpan pad-arth attestations.
update grammar_rules set
  verified = true,
  citation = 'Sahib Singh, Gurbani Viakaran (1939): kārak via laga-mātra. Verified against his Sri Guru Granth Sahib Darpan pad-arth, which attests aunkar-ending words as masculine kartā kārak (ਸਾਹਿਬੁ, ਸਾਚੁ, ਵੀਚਾਰੁ, ਇਕੁ in Japji) and notes that feminine nouns drop the aunkar even in the singular (ਹਾਥ).'
where rule_code = 'AUNKAR_NOM_SG';

-- 4. SIHARI_OBL_SG: kept unverified; record the counter-evidence as a caveat so
--    the rule never reads as settled. Sihari-ending FEMININE nouns can be nominative.
update grammar_rules set
  explanation = 'A noun ending in sihari (ਿ) typically stands in an oblique singular case (karan/adhikaran kārak). CAVEAT (Darpan pad-arth): this is not unconditional — a sihari-ending feminine noun can stand as the nominative subject (Sahib Singh marks ਕੁਦਰਤਿ feminine where it heads ''ਕੁਦਰਤਿ ਕਵਣ''). Treat as a default for masculine nominals pending per-word verification.',
  citation = 'Sahib Singh, Gurbani Viakaran (1939). Counter-example noted in his Darpan pad-arth (ਕੁਦਰਤਿ, feminine nominative). Pending page-level verification.'
where rule_code = 'SIHARI_OBL_SG';
