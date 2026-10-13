-- 042_aunkar_rule_syncretism.sql
-- Corrects AUNKAR_NOM_SG against the primary source (issue #187).
--
-- Migration 025 left this rule's explanation and its verified flag alone, amending only the
-- citation, and raised #27 so a human could decide whether to un-verify it. #27 was closed
-- without that decision, so the rule has stayed `verified = true` while asserting that final
-- aunkar is "applied uniformly" to mean nominative singular.
--
-- The new corrected text layer of the Singh Brothers 2011 scan settles it, and not in the way
-- 025 or #187 first supposed. Sahib Singh states the syncretism outright, in the mainline
-- mukta-stem paradigm rather than in any edge class:
--
--   p.77, heading "ਕਰਮ ਕਾਰਕ, ਇਕ-ਵਚਨ (Accusative Singular)":
--     "ਸ਼ਬਦ ਦੇ ਅੰਤ ਵਿਚ (ੁ) ਲਾਇਆ ਜਾਂਦਾ ਹੈ"  -- the aunkar is added at the end of the word
--   with ਮੋਹੁ, ਕਾਗਦੁ, ਭਾਉ, ਚਿਤੁ, ਨਾਮੁ, ਬੀਚਾਰੁ as his examples, each glossed with ਨੂੰ:
--     "ਜਾਲਿ ਮੋਹੁ" -> "ਮੋਹ ਨੂੰ ਸਾੜ ਦੇ";  "ਲਿਖੁ ਨਾਮੁ" -> "ਨਾਮ ਨੂੰ ਲਿਖ"
--
--   p.77 then raises the point himself and answers it:
--     "ਕਰਤਾ ਕਾਰਕ ਇਕ-ਵਚਨ ਦਾ ਰੂਪ (ੁ-ਅੰਤ) ਹੈ, ਕਰਮ ਕਾਰਕ ਇਕ-ਵਚਨ ਦਾ ਰੂਪ ਭੀ (ੁ-ਅੰਤ) ਹੈ।
--      ਦੋਹਾਂ ਦਾ ਇਕੋ ਰੂਪ ਕਿਉਂ ਹੈ?"
--   Sanskrit distinguished nominative from accusative in the masculine but not the neuter;
--   Punjabi lost neuter gender while keeping that syncretism in the first two cases (pp.77-78).
--
--   The p.62 kaarak table agrees: ਕਰਤਾ and ਕਰਮ singular both carry the aunkar.
--
-- Shackle concurs from the other side: his declension III has sd. = so. = pd., so a -u form
-- such as ਗੁਰੁ can be direct singular, oblique singular or plural unchanged (SLS §090 p.62).
--
-- This is therefore not a scholarly conflict to route to a human under #25 -- one source states
-- the syncretism and explains it, and the other agrees. Our rule statement was simply wrong.
--
-- Scope: this migration changes ONLY the registry row. `word_grammar` has held 0 rows for every
-- rule code since 037 archived the inferred grammar, so no per-word reading changes.
--
-- Also verified while here, and deliberately left untouched:
--   * MUKTA_OBL_SG -- 025's "mukta in the plural of six of the eight kaaraks, singular only for
--     sampradaan/sambandh/sambodhan" is confirmed exactly by the p.62 table. An earlier review
--     against the old djvu layer reported four, but that layer could not render the table.
--   * SIHARI_OBL_SG -- p.62 confirms ਕਰਣ and ਅਧਿਕਰਣ singular both take ਿ / ਹਿ, as 025 narrowed it.

update grammar_rules set
  title = 'Aunkar ending -> nominative OR accusative singular (masculine)',
  explanation = 'A masculine noun ending in aunkar (ੁ) stands in the SINGULAR, but the case is '
    'not determined: the same form serves both kartaa kaarak (nominative) and karam kaarak '
    '(accusative). Sahib Singh states this directly at Gurbani Viakaran p.77, where the '
    'accusative singular is formed by adding aunkar to the word, with mohu, kaagadu, bhaau, '
    'chitu, naamu and beechaaru as his examples, each glossed with ਨੂੰ -- "jaali mohu" is '
    '"burn away attachment", object not subject. He raises the identity himself ("the nominative '
    'singular form is aunkar-final, and the accusative singular form is aunkar-final too; why do '
    'both have one form?") and explains it historically: Sanskrit distinguished the two cases in '
    'the masculine but not the neuter, and Panjabi lost neuter gender while keeping that shared '
    'form in the first two cases (pp.77-78). The p.62 kaarak table shows the same, with aunkar '
    'in both the kartaa and karam singular. Which of the two applies in a given line depends on '
    'the governing verb, so this cannot be decided from the word alone.',
  citation = 'Sahib Singh, Gurbani Viakaran (1939; Singh Brothers 17th ed. 2011), pp.77-78 '
    '(nominative/accusative syncretism, stated and explained), p.62 (kaarak marker table: aunkar '
    'in both kartaa and karam singular). Corroborated by Christopher Shackle, An Introduction to '
    'the Sacred Language of the Sikhs (1983), §090 p.62: declension III has sd. = so. = pd., so a '
    'final -u form may be direct singular, oblique singular or plural. '
    'Previously stated as nominative "applied uniformly", which the source contradicts on its own '
    'mainline paradigm. Unverified pending an occurrence-level reading that can see the verb (#24).',
  verified = false
where rule_code = 'AUNKAR_NOM_SG';
