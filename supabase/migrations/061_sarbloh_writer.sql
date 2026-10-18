-- 061: Sri Sarbloh Granth shabads are attributed to Guru Gobind Singh Ji (#205).
--
-- Attribution: an internal decision (maintainer, 2026-10-17), not taken from a published source.
-- Authorship of Sri Sarbloh Granth is debated; we record every Sarbloh shabad as written by Guru
-- Gobind Singh Ji, with the same writer_english / writer_id (47, BaniDB's) as Dasam Bani, so the
-- Writer filter and per-writer word stats treat the two together. Revisit if a sourced attribution
-- per section is adopted.
--
-- Shabad ids: the Sarbloh shabad ids (900001+, migration 060) are also ours, assigned internally in
-- reading order. They are not BaniDB's or any other source's ids, and nothing reserves the range:
-- a future source (or BaniDB adding Sarbloh) could hand out ids in 900001+ that clash with these.
-- Check this range before loading any new source's shabads.

update shabads s
   set writer_english = 'Guru Gobind Singh Ji', writer_id = 47
 where s.writer_id is null
   and exists (
     select 1 from lines l join sources src on src.id = l.source_fk
      where l.shabad_id = s.id and src.code = 'sarbloh_budha_dal'
   );

-- Per-writer stats (008, 052) left Sarbloh out while its shabads had no writer.
refresh materialized view concurrently word_writer_stats;
select refresh_word_corpus_writer_stats();
