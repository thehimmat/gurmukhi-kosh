-- #162: lines.source_id was 'G' (BaniDB's letter for Guru Granth Sahib) on every line of every
-- scripture: a column default from 001 that no ingest ever set, so it claimed a BaniDB provenance
-- Sri Sarbloh, Gur Sobha and the rest don't have. No app, pipeline, view or function reads it; the
-- scripture is lines.source_fk (always scope verse_id by it, pipeline/shared/lines.ts).
-- `if exists`: the replay (tests/db) starts from 001 as it stands today, which already lacks it.
alter table public.lines drop column if exists source_id;
