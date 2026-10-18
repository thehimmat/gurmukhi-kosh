-- 061: Bhai Nand Lal's Ghazals (Diwan-e-Goya) in Gurmukhi (pipeline/nand-lal/README.md).
--
-- Canonical text (user decision, 2026-10-18): "Ghazals Bhai Nand Laal Goyaa Complete.pdf", 63 ghazals,
-- 361 shers, kept as printed (punctuation and every nukta). BaniDB's Bhai Nand Lal source (N, shabads
-- 30000-30062) is a variant, not loaded: it lacks ghazal 61, gives ghazal 63 twice (30060 and 30062),
-- orders 7-9 as 9, 7, 8, has 7 shers in ghazal 52 against 8, and lacks ਆਮਦਨ in ghazal 1.
--
-- One row per misra, as for Dasam Bani and Sarbloh: ang = ghazal number; verse_id = line_no = the running
-- misra number (1-722); a row's sher is ceil(k/2) for its k-th row in the ghazal, and the second misra
-- ends in ॥N॥. shabad_id is BaniDB's ShabadID for the same ghazal (pipeline/nand-lal/ghazals.ts
-- banidbShabadId), so a ghazal can be looked up in BaniDB directly. Ghazal 61, which BaniDB lacks, gets
-- 910061: shabad ids in use are SGGS 1-5540, Dasam 7402+, Bhai Gurdas 40001+, Sarbloh 900001-901564,
-- and BaniDB's N continues above 30062 (rubaiyan etc.), so neither range can collide. BaniDB's 30060 is
-- left unused. One shabads row per ghazal; writer_id 48 is BaniDB's id for Bhai Nand Lal Ji.
--
-- The lines themselves are loaded by `npm run build:nand-lal` (its load SQL), not here.
-- Reading order (046): after Bhai Gurdas Ji Vaaran.

insert into sources (code, name, version, description)
values (
  'nand_lal_ghazals',
  'Bhai Nand Lal: Diwan-e-Goya (Ghazals)',
  'ghazals-complete-pdf',
  'Bhai Nand Lal''s 63 Persian ghazals (Diwan-e-Goya) in Gurmukhi transliteration, one row per misra, as printed in "Ghazals Bhai Nand Laal Goyaa Complete.pdf" (typed GurbaniAkhar text). Shabad ids follow BaniDB (source N); BaniDB''s own text is a variant, not counted. No Persian-script original yet (#120).'
)
on conflict (code) do nothing;

insert into shabads (id, writer_english, writer_id, ang_start)
select id, 'Bhai Nand Lal Ji', 48, ghazal
  from (values
(30000, 1), (30001, 2), (30002, 3), (30003, 4), (30004, 5), (30005, 6), (30007, 7),
(30008, 8), (30006, 9), (30009, 10), (30010, 11), (30011, 12), (30012, 13), (30013, 14),
(30014, 15), (30015, 16), (30016, 17), (30017, 18), (30018, 19), (30019, 20), (30020, 21),
(30021, 22), (30022, 23), (30023, 24), (30024, 25), (30025, 26), (30026, 27), (30027, 28),
(30028, 29), (30029, 30), (30030, 31), (30031, 32), (30032, 33), (30033, 34), (30034, 35),
(30035, 36), (30036, 37), (30037, 38), (30038, 39), (30039, 40), (30040, 41), (30041, 42),
(30042, 43), (30043, 44), (30044, 45), (30045, 46), (30046, 47), (30047, 48), (30048, 49),
(30049, 50), (30050, 51), (30051, 52), (30052, 53), (30053, 54), (30054, 55), (30055, 56),
(30056, 57), (30057, 58), (30058, 59), (30059, 60), (910061, 61), (30061, 62), (30062, 63)
  ) v(id, ghazal)
on conflict (id) do nothing;

do $$
declare
  sggs     bigint := (select id from sources where code = 'sggs_banidb_v2');
  dasam    bigint := (select id from sources where code = 'dasam_banidb_v2');
  sarbloh  bigint := (select id from sources where code = 'sarbloh_budha_dal');
  gurdas   bigint := (select id from sources where code = 'bhai_gurdas_banidb_v2');
  ghazals  bigint := (select id from sources where code = 'nand_lal_ghazals');
begin
  execute format($f$
    alter table lines alter column corpus_rank set expression as (
      case source_fk
        when %s then 0    -- sggs_banidb_v2
        when %s then 10   -- dasam_banidb_v2
        when %s then 20   -- sarbloh_budha_dal
        when %s then 30   -- bhai_gurdas_banidb_v2
        when %s then 40   -- nand_lal_ghazals
        else 100
      end
    )$f$, sggs, dasam, sarbloh, gurdas, ghazals);
end $$;
