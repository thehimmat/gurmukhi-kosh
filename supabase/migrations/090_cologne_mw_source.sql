-- 090: Monier-Williams, A Sanskrit-English Dictionary (1899), from the Cologne Digital Sanskrit
-- Dictionaries, as a dictionary source (plan Phase 1, #249).
--
-- The 1899 text is public domain; Cologne's digitization (github.com/sanskrit-lexicon/csl-orig) is
-- licensed CC BY-SA 4.0 (checked 2026-11-10, #273): attribution, and anything built from it shared
-- under the same licence. Loaded curator-only until the Kosh decides how it carries share-alike data
-- (attribution on /about, and the licence of what it derives). Releasing it is one update:
--   update source_rights set visibility = 'public' where code = 'cologne_mw';
--
-- The entries are loaded by `npm run load:cologne -- --dict=mw` (pipeline/cologne/README.md), not here.

insert into dict_sources (code, name, language, url, notes) values
  ('cologne_mw', 'Monier-Williams, A Sanskrit-English Dictionary (1899)', 'sa',
   'https://www.sanskrit-lexicon.uni-koeln.de/scans/MWScan/2020/web/index.php',
   'Cologne Digital Sanskrit Dictionaries, csl-orig v02/mw. Text public domain; digitization CC BY-SA 4.0, Cologne Sanskrit Lexicon project.')
on conflict (code) do nothing;

insert into source_rights (code, visibility, rights_status, licence, notes) values
  ('cologne_mw', 'curator', 'open', 'CC BY-SA 4.0',
   'Cologne csl-orig digitization of MW 1899 (text PD). Curator-only until share-alike handling is decided.')
on conflict (code) do nothing;
