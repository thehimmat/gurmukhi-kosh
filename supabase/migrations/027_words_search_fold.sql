-- 027: words.search_fold — lossy orthographic key for fuzzy text search
-- (#63). Computed by lib/gurmukhi-fold.ts (dental/retroflex, nukta, vowel
-- length, nasal signs, final short matra all folded); populated by
-- pipeline/search-fold/populate.ts; matched by prefix in /api/search.
--
-- Distinct from words.phonetic_ipa, the speech-tuned IPA key OWNED BY
-- gurmukhi-voice-search (see APP_INTERACTIONS.md) — the two keys serve
-- different input domains (typed Gurmukhi vs recognized speech) and are
-- populated by different apps' scripts.
alter table words add column if not exists search_fold text;
create index if not exists idx_words_search_fold on words (search_fold text_pattern_ops);
