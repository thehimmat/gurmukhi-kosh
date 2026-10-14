-- 046: corpus reading order SGGS, Dasam, Sarbloh, Bhai Gurdas; indexes for
-- substring search and the most-frequent-words feed (gurmukhi-search's
-- Gurbani and Dictionary landing feeds and search-as-you-type).
--
-- 1. corpus_rank (031, 038) moves Sri Sarbloh Granth ahead of Bhai Gurdas Ji
--    Vaaran. Sort key only; nothing reads the numbers. Ids come from the codes,
--    as in 038. The unused sarbloh_avatars case (merged away in 039) is not
--    carried over. SET EXPRESSION rewrites lines and rebuilds its indexes.
--
-- 2. lines_gurmukhi_trgm: Contains search is `gurmukhi like '%q%'`, which had
--    no usable index, so every search read all ~172k lines (0.7-4 s, run twice
--    per search with the exact count). Dry run against live data, SGGS + Dasam,
--    first 21 in reading order: ਸਤਿਗੁਰ ਪ੍ਰਸਾਦਿ 69 ms and ਵਾਹਿਗੁਰੂ 15 ms via
--    this index; common terms (ਨਾਮੁ, ਹਰਿ ਨਾਮ, ਖਸ) 8-10 ms via the ordered
--    lines_corpus_rank_ang scan.
--
-- 3. words_frequency_rank: the Dictionary feed pages words by
--    (frequency desc, id) with a keyset cursor. Without it every page sorted
--    all ~88k words (offset 20000: 1.2 s); with it, any page is ~2 ms.

do $$
declare
  sggs     bigint := (select id from sources where code = 'sggs_banidb_v2');
  dasam    bigint := (select id from sources where code = 'dasam_banidb_v2');
  sarbloh  bigint := (select id from sources where code = 'sarbloh_budha_dal');
  gurdas   bigint := (select id from sources where code = 'bhai_gurdas_banidb_v2');
begin
  execute format($f$
    alter table lines alter column corpus_rank set expression as (
      case source_fk
        when %s then 0    -- sggs_banidb_v2
        when %s then 10   -- dasam_banidb_v2
        when %s then 20   -- sarbloh_budha_dal
        when %s then 30   -- bhai_gurdas_banidb_v2
        else 100
      end
    )$f$, sggs, dasam, sarbloh, gurdas);
end $$;

create index if not exists lines_gurmukhi_trgm on lines using gin (gurmukhi gin_trgm_ops);

create index if not exists words_frequency_rank on words (frequency desc, id);
