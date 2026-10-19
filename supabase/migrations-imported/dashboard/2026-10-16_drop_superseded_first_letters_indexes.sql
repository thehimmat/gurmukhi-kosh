-- DASHBOARD: run from the Supabase dashboard SQL editor on 2026-10-16, after 057 and before 058, with no
-- server-ledger entry (the MCP holds DROP for a confirmation). Copied from supabase/APPLIED.md.

drop index if exists lines_first_letters;        -- 044, superseded by lines_first_letters_cover (045)
drop index if exists lines_first_letters_fold1;  -- 047, superseded by lines_first_letters_fold1_cover (051)
drop index if exists lines_first_letters_fold2;  -- 047, superseded by lines_first_letters_fold2_cover (051)
