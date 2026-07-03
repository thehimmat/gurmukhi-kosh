-- 012_verb_form_rules.sql
-- Registry entries for the non-finite verb-form rules the engine now emits
-- (analyzeVerbForm): the infinitive and the verbal noun, classified from a verb's
-- ending per Sahib Singh's Viakaran kriya morphology. Like the noun case rules
-- these are transcribed from knowledge of Viakaran and not yet page-verified, so
-- verified=false. Idempotent.

insert into grammar_rules (rule_code, title, explanation, citation, tier, verified) values
  ('VERB_INFINITIVE', 'The -ਣਾ/-ਨਾ ending → infinitive',
   'A verb form ending in -ਣਾ or -ਨਾ is the infinitive — the "to ___" / naming form of the verb (e.g. ਕਰਣਾ "to do", ਕਥਨਾ "to narrate"). Determined from the ending; consulted only when the word is already a verb.',
   'Sahib Singh, Gurbani Viakaran (1939): kriyā forms. Pending page-level verification.',
   'codified_rule', false),
  ('VERB_VERBAL_NOUN', 'The -ਣੁ/-ਨੁ (and oblique -ਣੇ/-ਣੈ) ending → verbal noun',
   'A verb form ending in -ਣੁ/-ਨੁ (or its oblique/plural -ਣੇ/-ਨੇ/-ਣੈ/-ਨੈ) is a verbal noun — the act of the verb treated as a noun (e.g. ਆਖਣੁ "the saying", ਕਰਣੈ "in the doing"). Determined from the ending; consulted only when the word is already a verb.',
   'Sahib Singh, Gurbani Viakaran (1939): kriyā forms. Pending page-level verification.',
   'codified_rule', false)
on conflict (rule_code) do update set
  title=excluded.title, explanation=excluded.explanation,
  citation=excluded.citation, tier=excluded.tier;
