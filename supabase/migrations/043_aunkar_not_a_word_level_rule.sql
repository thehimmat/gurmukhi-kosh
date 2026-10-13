-- 043_aunkar_not_a_word_level_rule.sql
-- Second correction to AUNKAR_NOM_SG (issue #187), after re-verifying the rest of the
-- Gurbani Viakaran findings against the new corrected text layer.
--
-- 042 removed the claim that final aunkar means the nominative, having found the
-- nominative/accusative syncretism at pp.77-78. But it still asserted that an aunkar-final
-- word is a MASCULINE noun in the SINGULAR. Two further passages show that is also too
-- strong, and that the ending does not even fix the part of speech:
--
--   p.356 (and pp.355-359), invariant adjectives. Of ਖੁਆਰੁ he writes:
--     "ਵਿਸ਼ੇਸ਼ਣ 'ਖੁਆਰੁ' ਦਾ ਰੂਪ ਹਰੇਕ ਥਾਂ ਉਹੀ ਰਿਹਾ ਹੈ (ੁ-ਅੰਤ)"
--     -- the adjective keeps the same aunkar-final form everywhere -- and his own examples
--     have it agreeing with ਪੂਜ (feminine), ਦੋਹਾਗਣਿ (feminine), ਕੂੜਿਆਰ (masculine plural)
--     and ਜੀਵ (plural). ਥਿਰੁ behaves the same with ਮਤਿ and ਤੰਤੀ (feminine) and ਭਗਤ, ਪ੍ਰਾਨ
--     (plural). So an aunkar-final word need be neither masculine nor singular, nor a noun.
--
--   p.270, verbs. The present 3rd person plural takes -ਨਿ (ਮਾਰਨਿ, ਕਰਨਿ, ਸੇਵਨਿ) while the
--     ਹੁਕਮੀ ਭਵਿੱਖਤ 3rd person plural takes -ਨੁ (ਮਾਰਨੁ, ਵਿਸਰਨੁ, ਜਲਨੁ), a distinction he
--     flags as "ਖ਼ਾਸ ਤੌਰ 'ਤੇ ਧਿਆਨ ਰੱਖਣ-ਜੋਗ". Those are aunkar-final VERBS, and plural.
--
-- Taken with 042's syncretism finding, final aunkar fixes nothing on its own: not case, not
-- number, not gender, not part of speech. It is retired as a word-level predictor here rather
-- than narrowed again, since each successive narrowing has been contradicted by the next
-- passage. An occurrence-level reading that can see the governing verb and the agreeing noun
-- is the only honest route (#24), which is what #21 concluded for the other two rules.
--
-- Registry row only. `word_grammar` has held 0 rows for every rule code since 037.

update grammar_rules set
  title = 'Aunkar ending -> not decidable from the word alone',
  explanation = 'A final aunkar (ੁ) does not by itself fix case, number, gender or even part of '
    'speech, so it cannot support a word-level reading. Gurbani Viakaran shows it in at least '
    'four roles. (1) Noun, kartaa kaarak singular -- the nominative. (2) Noun, karam kaarak '
    'singular -- the accusative: p.77 forms the accusative singular by adding aunkar, with mohu, '
    'kaagadu, chitu, naamu glossed using ਨੂੰ, and pp.77-78 explain the shared form historically '
    '(Sanskrit distinguished the two cases in the masculine but not the neuter; Panjabi lost '
    'neuter and kept the syncretism). (3) Invariant adjective, of any gender or number: of '
    'khuaaru he writes that the adjective "keeps the same aunkar-final form everywhere" (p.356), '
    'and it agrees there with feminine pooj and dohaagani and with plural koorhiaar and jeev; '
    'thiru behaves likewise with feminine mati and plural bhagat. (4) Verb, hukamee bhavikhat '
    'third person plural, where -nu contrasts with present -ni (maaranu against maarani, p.270). '
    'Which role applies depends on the governing verb and on the noun the word agrees with, so '
    'it is decidable only at the occurrence level.',
  citation = 'Sahib Singh, Gurbani Viakaran (1939; Singh Brothers 17th ed. 2011): pp.77-78 and '
    'p.62 (nominative/accusative syncretism), pp.355-359 esp. p.356 (invariant aunkar-final '
    'adjectives across gender and number), p.270 (aunkar-final hukamee bhavikhat plural verbs). '
    'Corroborated by Christopher Shackle, An Introduction to the Sacred Language of the Sikhs '
    '(1983): declension III has sd. = so. = pd. (§090 p.62) and gur-u belongs to it despite its '
    'final -u (§020 p.25). Retired as a word-level rule; superseded by occurrence-level '
    'extraction (#24). Previously asserted as nominative singular masculine, "applied uniformly".',
  verified = false
where rule_code = 'AUNKAR_NOM_SG';
