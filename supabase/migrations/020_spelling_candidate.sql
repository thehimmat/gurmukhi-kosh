-- 020_spelling_candidate.sql
-- Issue #6: the OCR spelling cross-check (reverse-transliteration vs printed
-- Gurmukhi, pipeline/shackle/verify_spellings.py) leaves a small set of
-- off-corpus words whose OCRed spelling is neither corpus-attested nor
-- consistent with the reverse-transliteration. Store the reverse-transliteration's
-- suggested correction so those become a reviewable queue:
--   words where spelling_status='unverified_ocr' and spelling_candidate is not null.
alter table words add column if not exists spelling_candidate text;
