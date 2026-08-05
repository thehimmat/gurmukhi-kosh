-- 024_viakaran_rule_corrections.sql
-- Corrects the grammar_rules registry against the primary source: Prof. Sahib Singh,
-- Gurbani Viakaran (Singh Brothers, 17th ed. 2011; first ed. 1939). Page references are
-- to that edition and were transcribed from the 300 DPI scan (issue #24, Phase 0).
--
-- This migration changes ONLY the rule registry — the plain-English basis, the citation,
-- and the verified flag. It deliberately does NOT touch word_grammar rows and does NOT
-- add new rule codes: rewriting the engine's rule set depends on the option chosen on
-- issue #21 (narrow / go occurrence-level / downgrade), which is still open. What is
-- recorded here is only what the book unambiguously establishes.
--
-- Summary of findings (full transcription in .projects/viakaran-phase0-transcription.md):
--
--   * p.62 gives the full kaarak x vachan marker table for mukta-stem masculine nouns.
--     Mukta appears in the PLURAL of 6 of 8 cases, and in the singular only for
--     sampradaan/sambandh/sambodhan -- never for karan or adhikaran, the very cases
--     MUKTA_OBL_SG's note claims. The ending-to-case mapping is many-to-many.
--   * p.71 states outright, of its mukta-ending examples: "they are all in the
--     nominative case, PLURAL". p.72 adds that the agreeing verbs are plural too.
--   * p.129 note: "only in the masculine can the aunkar occur" -- so a mukta-only stem
--     is feminine, and its bare form is nominative, not oblique.
--   * p.135 opens the sihari-final feminine section with NOMINATIVE singular, and forms
--     its plural sihari -> bihari (kudrati -> kudrati-bihari). Kudrati is a paradigm
--     member, not an exception.
--   * p.83 / p.101 confirm sihari DOES mark instrumental and locative singular -- but
--     for masculine mukta-stem nouns only.

-- MUKTA_OBL_SG: contradicted by the source. Kept unverified and retitled to state what
-- the book actually shows, so the UI stops asserting "oblique singular".
update grammar_rules set
  title = 'Mukta (bare) ending -> ambiguous; most often nominative plural',
  explanation = 'A bare noun form with no final vowel sign (mukta) does NOT determine one '
    'reading. Per Gurbani Viakaran p.62, mukta occurs in the plural of six of the eight '
    'kaaraks, and in the singular only for sampradaan, sambandh and sambodhan -- not for '
    'karan or adhikaran. p.71 states of its mukta-ending examples that they are all '
    'nominative PLURAL, and p.72 notes the agreeing verbs are plural too. p.129 adds that '
    'a mukta-only stem is feminine (only the masculine can take aunkar), and its bare form '
    'is nominative singular. Mukta is the absence of a marker, so it cannot signal a single '
    'case: the reading depends on the governing verb and on the noun''s gender class.',
  citation = 'Sahib Singh, Gurbani Viakaran (1939; Singh Brothers 17th ed. 2011), pp.62, 71-72, 129. '
    'CONTRADICTED as previously stated: the book gives mukta as predominantly a plural marker, '
    'not an oblique-singular marker. Retained unverified pending the rule-engine rewrite (issue #21).',
  verified = false
where rule_code = 'MUKTA_OBL_SG';

-- SIHARI_OBL_SG: correct for masculine mukta-stem nouns, wrong for the sihari-final
-- feminine class. Narrowed in wording; still unverified because the engine does not yet
-- make the gender distinction the rule depends on.
update grammar_rules set
  title = 'Sihari ending -> oblique singular (masculine mukta-stem nouns only)',
  explanation = 'For a MASCULINE mukta-stem noun, final sihari marks an oblique singular: '
    'karan kaarak (instrumental, Gurbani Viakaran p.83 -- saabuni "with soap", sabadi '
    '"through the shabad") and adhikaran kaarak (locative, p.101 -- mani "in the mind", '
    'ghari "in the house"). It does NOT generalise: p.135 opens the sihari-final FEMININE '
    'section with the nominative singular (barakati), and those nouns form their plural by '
    'sihari -> bihari (agani/agani-bihari, mati/mati-bihari, kudrati/kudrati-bihari), which '
    'makes the sihari form the citation form rather than a case inflection. The discriminator '
    'is the one stated at p.129: only masculine nouns can take aunkar, so a stem attested '
    'elsewhere with aunkar is masculine (rule applies) and a sihari-only stem is feminine '
    '(rule does not apply).',
  citation = 'Sahib Singh, Gurbani Viakaran (1939; Singh Brothers 17th ed. 2011), pp.83, 101 '
    '(masculine oblique -- rule holds); pp.129, 135 (feminine nominative -- rule does not hold). '
    'Unverified because the engine does not yet apply the gender condition the rule requires (issue #21).',
  verified = false
where rule_code = 'SIHARI_OBL_SG';

-- AUNKAR_NOM_SG: still supported for mukta-stem masculine nouns, but p.111 documents a
-- separate noun class whose STEM ends in aunkar, where final aunkar is karam or sampradaan
-- rather than nominative. The engine cannot currently tell the two classes apart.
--
-- The verified flag is deliberately LEFT AS IS (true). Whether that caveat is severe enough
-- to un-verify the rule is a scholarly call for the maintainer, not one this migration should
-- make silently -- it is raised as issue #27. Only the citation is amended, so the caveat is
-- visible on the word page in the meantime.
update grammar_rules set
  citation = 'Sahib Singh, Gurbani Viakaran (1939; Singh Brothers 17th ed. 2011): kaarak via '
    'laga-maatra. Verified against his Sri Guru Granth Sahib Darpan pad-arth, which attests '
    'aunkar-ending words as masculine kartaa kaarak (sahibu, saachu, veechaaru, iku in Japji) '
    'and notes that feminine nouns drop the aunkar even in the singular (haath); corroborated '
    'by Viakaran p.62. CAVEAT (Viakaran p.111): a separate aunkar-STEM masculine class exists '
    '(bhau, heeu, hiaau, nirbhau) in which final aunkar marks karam or sampradaan kaarak, not '
    'the nominative. The engine does not distinguish stem-final aunkar from inflectional '
    'aunkar, so this rule is over-applied to that class. See issue #27.'
where rule_code = 'AUNKAR_NOM_SG';

-- The two non-finite verb rules: the book's kriyaa chapters (bhaavaarthak kaardantak p.279,
-- naanv-dhaatoo p.290) were not part of the Phase 0 page set, so these are left untouched
-- rather than given a citation that has not been checked.
