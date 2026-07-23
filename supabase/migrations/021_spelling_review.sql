-- 021_spelling_review.sql
-- Issue #6: state for the /admin/spellings review surface over the OCR
-- spelling-candidate queue. shackle_page = the book page (a review clue, so a
-- human can check the printed scan).
alter table words add column if not exists spelling_reviewed_at timestamptz;
alter table words add column if not exists spelling_review_note text;
alter table words add column if not exists shackle_page integer;
