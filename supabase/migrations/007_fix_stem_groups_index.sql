-- 007_fix_stem_groups_index.sql
-- word_stem_groups (migration 006) was created without a unique index, so
-- refresh_computed_stats() — which refreshes it CONCURRENTLY — errors with
-- "cannot refresh materialized view concurrently". Each word_id appears at most
-- once in the matview, so a unique index on word_id is valid and enables the
-- concurrent refresh. Idempotent: safe to re-run.

create unique index if not exists word_stem_groups_word_id_idx
  on word_stem_groups (word_id);
