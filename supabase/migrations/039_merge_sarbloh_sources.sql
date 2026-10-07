-- 039: one Sri Sarbloh Granth corpus (user decision, 2026-10-07).
--
-- 038 loaded the avatar section as its own corpus because the manuscripts (1878, 1698) end before it.
-- Budha Dal prints it as part of the Granth, and Budha Dal is the canonical authority here, so the
-- avatar lines join sarbloh_budha_dal: their verse_id / line_no continue after the Granth's last line
-- and their angs (Budha Dal pages 819-1028) already follow on. The description keeps the caveats.
-- corpus_rank (038) keeps its now-unused case for the old avatar id: rewriting the generated column
-- rewrites every line, which is not worth it for a branch no row can reach.

do $$
declare
  granth bigint := (select id from sources where code = 'sarbloh_budha_dal');
  avatars bigint := (select id from sources where code = 'sarbloh_avatars_budha_dal');
  last_line int;
begin
  if avatars is null then
    return; -- already merged
  end if;
  select max(verse_id) into last_line from lines where source_fk = granth;
  update lines
     set source_fk = granth, verse_id = verse_id + last_line, line_no = line_no + last_line
   where source_fk = avatars;
  delete from word_corpus_stats where source_fk = avatars;
  delete from sources where id = avatars;

end $$;

update sources
   set description = 'Sri Sarbloh Granth as printed by Budha Dal, pages 1-1028: the Manglacharan Purana and Adhyays 1-5 (pages 1-818), then the avatar section (Machh to Parasram, Ram Charit, Dasam Skandh; pages 819-1028), which Budha Dal prints as part of the Granth. Typed Budha Dal text; pages 1-818 have typing slips corrected against a scan of the print. The manuscript witnesses (1878 Bhai Chanda Singh, 1698 Mastuana, Mai Bhago) and the Jasvant Singh critical edition end before the avatar section (the critical edition has excerpts); they are kept as variants, not counted.'
 where code = 'sarbloh_budha_dal';
