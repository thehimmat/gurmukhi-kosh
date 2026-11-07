-- 088: a pad-arth gloss can sit on its line as a compound spaced differently (#179 item 4, #377).
--
-- Sahib Singh sometimes writes a compound joined where the line splits it (ਝਿਲਿਮਿਲਿਕਾਰੁ on the
-- line's ਝਿਲਿ ਮਿਲਿ ਕਾਰੁ), or split where the line joins it (ਭਖ ਸਾਰ on ਭਖਸਾਰ). The same letters,
-- exact apart from the spaces, over 1–3 consecutive words (lib/padarth/align.ts): match
-- 'compound'. Re-run `npm run ingest:padarth:glosses` after applying, to place them.

alter table padarth_gloss_occurrences drop constraint if exists padarth_gloss_occurrences_match_check;
alter table padarth_gloss_occurrences add constraint padarth_gloss_occurrences_match_check
  check (match in ('exact', 'gapped', 'via_base', 'compound'));
