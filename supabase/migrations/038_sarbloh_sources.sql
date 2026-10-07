-- 038: Sri Sarbloh Granth as two corpora (pipeline/scans/sarbloh/README.md).
--
-- The text is the Budha Dal print (canonical by decision, 2026-10-07): the 2022 typed Budha Dal
-- edition, page for page, with its typing slips corrected against a scan of the print. `ang` is
-- the Budha Dal page. Lines are half-lines ending in their verse numbers, as for Dasam Bani.
--   - sarbloh_budha_dal: the Granth proper (Manglacharan Purana, Adhyays 1-5; Budha Dal pages 1-818).
--   - sarbloh_avatars_budha_dal: the avatar section that follows in the Budha Dal print (pages
--     819-1028). Kept as a separate work: the 1878 and 1698 manuscripts end before it, and the
--     critical edition has it only in excerpts. Not yet checked against the print scan.
--
-- Reading order (031): after SGGS, Dasam Bani and Bhai Gurdas, the Granth, then its avatars.
-- corpus_rank keys on source_fk ids, which are only known once the rows exist, so the
-- expression is rebuilt from the codes (Postgres 17: SET EXPRESSION keeps the index).

insert into sources (code, name, version, description)
values
  ('sarbloh_budha_dal',
   'Sri Sarbloh Granth',
   'budha-dal-print',
   'Sri Sarbloh Granth (Manglacharan Purana, Adhyays 1-5) as printed by Budha Dal, pages 1-818: the 2022 typed Budha Dal text with typing slips corrected against a scan of the print. Manuscript witnesses (1878 Bhai Chanda Singh, 1698 Mastuana, Mai Bhago) and the Jasvant Singh critical edition are kept as variants, not counted.'),
  ('sarbloh_avatars_budha_dal',
   'Sri Sarbloh Granth: Avatars (Budha Dal)',
   'budha-dal-print',
   'The avatar section (Machh to Parasram, Ram Charit, Dasam Skandh) that follows Sri Sarbloh Granth in the Budha Dal print, pages 819-1028; part of Sarbloh Granth according to Budha Dal. Typed text, not yet checked against the print.')
on conflict (code) do nothing;

do $$
declare
  granth bigint := (select id from sources where code = 'sarbloh_budha_dal');
  avatars bigint := (select id from sources where code = 'sarbloh_avatars_budha_dal');
begin
  execute format($f$
    alter table lines alter column corpus_rank set expression as (
      case source_fk
        when 1 then 0    -- sggs_banidb_v2
        when 3 then 10   -- dasam_banidb_v2
        when 2 then 20   -- bhai_gurdas_banidb_v2
        when %s then 30  -- sarbloh_budha_dal
        when %s then 40  -- sarbloh_avatars_budha_dal
        else 100
      end
    )$f$, granth, avatars);
end $$;
