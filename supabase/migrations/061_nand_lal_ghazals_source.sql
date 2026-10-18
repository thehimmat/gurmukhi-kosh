-- 061: Bhai Nand Lal's Ghazals (Diwan-e-Goya) in Gurmukhi (pipeline/nand-lal/README.md).
--
-- Canonical text (user decision, 2026-10-18): "Ghazals Bhai Nand Laal Goyaa Complete.pdf", 63 ghazals,
-- 361 shers. BaniDB's Bhai Nand Lal source (N, shabads 30000-30062) is a variant, not loaded: it lacks
-- ghazal 61, gives ghazal 63 twice (30060 and 30062), orders 7-9 as 8, 9, 7, has 7 shers in ghazal 52
-- against 8, and lacks ਆਮਦਨ in ghazal 1.
--
-- One row per misra, as for Dasam Bani and Sarbloh: ang = ghazal number; verse_id = line_no = the
-- running misra number (1-722); a row's sher is ceil(k/2) for its k-th row in the ghazal, and the second
-- misra ends in ॥N॥. shabad_id = 910000 + ghazal (910001-910063), one shabads row per ghazal: shabad ids
-- in use are SGGS 1-5540, Dasam 7402+, Bhai Gurdas 40001+, Sarbloh 900001-901564, so 910001+ cannot
-- collide. writer_id 48 is BaniDB's id for Bhai Nand Lal Ji.
--
-- The lines themselves are loaded by `npm run build:nand-lal` (its load SQL), not here.
-- Reading order (046): after Bhai Gurdas Ji Vaaran.

insert into sources (code, name, version, description)
values (
  'nand_lal_ghazals',
  'Bhai Nand Lal: Diwan-e-Goya (Ghazals)',
  'ghazals-complete-pdf',
  'Bhai Nand Lal''s 63 Persian ghazals (Diwan-e-Goya) in Gurmukhi transliteration, one row per misra, from "Ghazals Bhai Nand Laal Goyaa Complete.pdf" (typed GurbaniAkhar text). BaniDB''s Bhai Nand Lal source (N) is kept as a variant, not counted. No Persian-script original yet (#120).'
)
on conflict (code) do nothing;

insert into shabads (id, writer_english, writer_id, ang_start)
select 910000 + g, 'Bhai Nand Lal Ji', 48, g
  from generate_series(1, 63) g
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
