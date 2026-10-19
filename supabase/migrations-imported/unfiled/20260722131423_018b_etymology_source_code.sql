-- UNFILED: copied verbatim from the server ledger (supabase_migrations.schema_migrations,
-- version 20260722131423, name 018b_etymology_source_code) on 2026-10-19. It ran only in the database; see supabase/APPLIED.md.

alter table etymology add column if not exists source_code text;
create index if not exists etymology_source_code on etymology (source_code) where source_code is not null;
