-- 091: the rest of plan Phase 1's Cologne Digital Sanskrit Dictionaries (#249) as dictionary sources,
-- registered as 090 registered Monier-Williams 1899: curator-only, digitization CC BY-SA 4.0 (#273).
--
-- Their printed texts are public domain except Apte's 1957-59 revision and Edgerton (1953), which
-- may still be in copyright: those are rights 'pending'. The rest are 'open'.
--
-- csl-orig ids → codes live in pipeline/cologne/codes.ts; entries are loaded by
-- `npm run load:cologne -- --dict=<id>` (pipeline/cologne/README.md), not here.

insert into dict_sources (code, name, language, url, notes) values
  ('cologne_mw72', 'Monier-Williams, A Sanskrit-English Dictionary (1872)', 'sa',
   'https://www.sanskrit-lexicon.uni-koeln.de/scans/MW72Scan/2020/web/index.php',
   'Cologne Digital Sanskrit Dictionaries, csl-orig v02/mw72. Text public domain. Digitization CC BY-SA 4.0, Cologne Sanskrit Lexicon project.'),
  ('cologne_ap90', 'Apte, The Practical Sanskrit-English Dictionary (1890)', 'sa',
   'https://www.sanskrit-lexicon.uni-koeln.de/scans/AP90Scan/2020/web/index.php',
   'Cologne Digital Sanskrit Dictionaries, csl-orig v02/ap90. Text public domain. Digitization CC BY-SA 4.0, Cologne Sanskrit Lexicon project.'),
  ('cologne_ap', 'Apte, The Practical Sanskrit-English Dictionary, revised ed. (1957-59)', 'sa',
   'https://www.sanskrit-lexicon.uni-koeln.de/scans/APScan/2020/web/index.php',
   'Cologne Digital Sanskrit Dictionaries, csl-orig v02/ap. Printed text may still be in copyright; check before release. Digitization CC BY-SA 4.0, Cologne Sanskrit Lexicon project.'),
  ('cologne_md', 'Macdonell, A Sanskrit-English Dictionary (1893)', 'sa',
   'https://www.sanskrit-lexicon.uni-koeln.de/scans/MDScan/2020/web/index.php',
   'Cologne Digital Sanskrit Dictionaries, csl-orig v02/md. Text public domain. Digitization CC BY-SA 4.0, Cologne Sanskrit Lexicon project.'),
  ('cologne_ben', 'Benfey, A Sanskrit-English Dictionary (1866)', 'sa',
   'https://www.sanskrit-lexicon.uni-koeln.de/scans/BENScan/2020/web/index.php',
   'Cologne Digital Sanskrit Dictionaries, csl-orig v02/ben. Text public domain. Digitization CC BY-SA 4.0, Cologne Sanskrit Lexicon project.'),
  ('cologne_cae', 'Cappeller, A Sanskrit-English Dictionary (1891)', 'sa',
   'https://www.sanskrit-lexicon.uni-koeln.de/scans/CAEScan/2020/web/index.php',
   'Cologne Digital Sanskrit Dictionaries, csl-orig v02/cae. Text public domain. Digitization CC BY-SA 4.0, Cologne Sanskrit Lexicon project.'),
  ('cologne_vei', 'Macdonell & Keith, Vedic Index of Names and Subjects (1912)', 'sa',
   'https://www.sanskrit-lexicon.uni-koeln.de/scans/VEIScan/2020/web/index.php',
   'Cologne Digital Sanskrit Dictionaries, csl-orig v02/vei. Text public domain. Digitization CC BY-SA 4.0, Cologne Sanskrit Lexicon project.'),
  ('cologne_pwg', 'Böhtlingk & Roth, Sanskrit-Wörterbuch (1855-75)', 'sa',
   'https://www.sanskrit-lexicon.uni-koeln.de/scans/PWGScan/2020/web/index.php',
   'Cologne Digital Sanskrit Dictionaries, csl-orig v02/pwg. Text public domain. Digitization CC BY-SA 4.0, Cologne Sanskrit Lexicon project.'),
  ('cologne_gra', 'Grassmann, Wörterbuch zum Rig-Veda (1873)', 'sa',
   'https://www.sanskrit-lexicon.uni-koeln.de/scans/GRAScan/2020/web/index.php',
   'Cologne Digital Sanskrit Dictionaries, csl-orig v02/gra. Text public domain. Digitization CC BY-SA 4.0, Cologne Sanskrit Lexicon project.'),
  ('cologne_vcp', 'Tārānātha Tarkavācaspati, Vācaspatyam (1873-84)', 'sa',
   'https://www.sanskrit-lexicon.uni-koeln.de/scans/VCPScan/2020/web/index.php',
   'Cologne Digital Sanskrit Dictionaries, csl-orig v02/vcp. Text public domain. Digitization CC BY-SA 4.0, Cologne Sanskrit Lexicon project.'),
  ('cologne_skd', 'Rādhākāntadeva, Śabdakalpadruma (1822-58)', 'sa',
   'https://www.sanskrit-lexicon.uni-koeln.de/scans/SKDScan/2020/web/index.php',
   'Cologne Digital Sanskrit Dictionaries, csl-orig v02/skd. Text public domain. Digitization CC BY-SA 4.0, Cologne Sanskrit Lexicon project.'),
  ('cologne_shs', 'Śabda-Sāgara, ed. Wilson, Goldstücker et al. (1900)', 'sa',
   'https://www.sanskrit-lexicon.uni-koeln.de/scans/SHSScan/2020/web/index.php',
   'Cologne Digital Sanskrit Dictionaries, csl-orig v02/shs. Text public domain. Digitization CC BY-SA 4.0, Cologne Sanskrit Lexicon project.'),
  ('cologne_bhs', 'Edgerton, Buddhist Hybrid Sanskrit Dictionary (1953)', 'sa',
   'https://www.sanskrit-lexicon.uni-koeln.de/scans/BHSScan/2020/web/index.php',
   'Cologne Digital Sanskrit Dictionaries, csl-orig v02/bhs. Printed text may still be in copyright; check before release. Digitization CC BY-SA 4.0, Cologne Sanskrit Lexicon project.')
on conflict (code) do nothing;

insert into source_rights (code, visibility, rights_status, licence, notes) values
  ('cologne_mw72', 'curator', 'open', 'CC BY-SA 4.0', 'Cologne csl-orig digitization (CC BY-SA 4.0); text PD. Curator-only until share-alike handling is decided.'),
  ('cologne_ap90', 'curator', 'open', 'CC BY-SA 4.0', 'Cologne csl-orig digitization (CC BY-SA 4.0); text PD. Curator-only until share-alike handling is decided.'),
  ('cologne_ap', 'curator', 'pending', 'CC BY-SA 4.0', 'Cologne csl-orig digitization (CC BY-SA 4.0); printed text 20th-century, rights pending. Curator-only until share-alike handling is decided.'),
  ('cologne_md', 'curator', 'open', 'CC BY-SA 4.0', 'Cologne csl-orig digitization (CC BY-SA 4.0); text PD. Curator-only until share-alike handling is decided.'),
  ('cologne_ben', 'curator', 'open', 'CC BY-SA 4.0', 'Cologne csl-orig digitization (CC BY-SA 4.0); text PD. Curator-only until share-alike handling is decided.'),
  ('cologne_cae', 'curator', 'open', 'CC BY-SA 4.0', 'Cologne csl-orig digitization (CC BY-SA 4.0); text PD. Curator-only until share-alike handling is decided.'),
  ('cologne_vei', 'curator', 'open', 'CC BY-SA 4.0', 'Cologne csl-orig digitization (CC BY-SA 4.0); text PD. Curator-only until share-alike handling is decided.'),
  ('cologne_pwg', 'curator', 'open', 'CC BY-SA 4.0', 'Cologne csl-orig digitization (CC BY-SA 4.0); text PD. Curator-only until share-alike handling is decided.'),
  ('cologne_gra', 'curator', 'open', 'CC BY-SA 4.0', 'Cologne csl-orig digitization (CC BY-SA 4.0); text PD. Curator-only until share-alike handling is decided.'),
  ('cologne_vcp', 'curator', 'open', 'CC BY-SA 4.0', 'Cologne csl-orig digitization (CC BY-SA 4.0); text PD. Curator-only until share-alike handling is decided.'),
  ('cologne_skd', 'curator', 'open', 'CC BY-SA 4.0', 'Cologne csl-orig digitization (CC BY-SA 4.0); text PD. Curator-only until share-alike handling is decided.'),
  ('cologne_shs', 'curator', 'open', 'CC BY-SA 4.0', 'Cologne csl-orig digitization (CC BY-SA 4.0); text PD. Curator-only until share-alike handling is decided.'),
  ('cologne_bhs', 'curator', 'pending', 'CC BY-SA 4.0', 'Cologne csl-orig digitization (CC BY-SA 4.0); printed text 20th-century, rights pending. Curator-only until share-alike handling is decided.')
on conflict (code) do nothing;
