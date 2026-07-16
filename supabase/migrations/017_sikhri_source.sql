-- 017_sikhri_source.sql
-- Registers SikhRI's "The Guru Granth Sahib Dictionary" as a dictionary source
-- so its English per-word meanings can be ingested into `definitions`
-- (dict_source_id-scoped, so removal on request is a single scoped delete).
--
-- Licensing: modern copyrighted work, © SikhRI, All Rights Reserved. Used per
-- the proceed-and-acknowledge decision (2026-07-16): free, strictly
-- non-commercial, prominently attributed on /about and per-entry, takedown-proof.

insert into dict_sources (code, name, language, url, notes) values
  ('sikhri', 'The Guru Granth Sahib Dictionary (SikhRI)', 'en',
   'https://gurugranthsahibdictionary.io',
   'Modern scholar-authored English dictionary of Guru Granth Sahib vocabulary (meanings + grammar + etymology). © SikhRI, All Rights Reserved; used non-commercially with attribution, removable on request.')
on conflict (code) do nothing;
