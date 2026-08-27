-- 031: reading order across corpora.
--
-- Search results and occurrence lists sort by (ang, line_no), which interleaves
-- the corpora — Bhai Gurdas ang 1 landed above SGGS ang 1. The wanted reading
-- order is SGGS first, then Dasam Bani, then Bhai Gurdas Ji Vaaran, then
-- anything ingested later.
--
-- source_fk's own order (1 SGGS, 2 Bhai Gurdas, 3 Dasam) is ingest order, not
-- reading order, so the rank is an explicit stored column: a generated column
-- keeps it in sync with source_fk automatically and, unlike a join, can back an
-- index — search_lines_by_word_ids (migration 003 in gurmukhi-search) depends on
-- walking lines in sort order to early-stop, so the sort key must be indexable.
--
-- A newly ingested corpus falls to the end (rank 100) until it is ranked here.

alter table lines
  add column if not exists corpus_rank int
  generated always as (
    case source_fk
      when 1 then 0    -- sggs_banidb_v2
      when 3 then 10   -- dasam_banidb_v2
      when 2 then 20   -- bhai_gurdas_banidb_v2
      else 100
    end
  ) stored;

create index if not exists lines_corpus_rank_ang on lines (corpus_rank, ang, line_no);
