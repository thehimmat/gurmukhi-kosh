-- 075: Bhai Gurdas Singh's vaar (ਵਾਹ ਵਾਹ ਗੋਬਿੰਦ ਸਿੰਘ ਆਪੇ ਗੁਰੁ ਚੇਲਾ), a 2008 GurbaniLipi typed text, as a
-- curator-only corpus.
--
-- See pipeline/gurdas-singh-vaar/README.md. Numbered 075, not 074: 074 is taken by the open index-trim PR.
-- Who typed the text, and who holds rights to it, is unknown, so the corpus is loaded curator-only
-- (source_rights, 069; corpora, 070) until that is settled. Publishing is one update, then re-run
-- refresh_word_frequencies and refresh_word_corpus_stats, and refresh word_writer_stats:
--   update source_rights set visibility = 'public', rights_status = 'permitted', licence = '…'
--    where code = 'gurdas_singh_vaar_2008';
--
-- One row per tuk; ang = the PDF page (the file prints none). Shabad ids 930001-930028, one per pauri,
-- ours. Ids in use: SGGS 1-5540, Dasam 7402+, Bhai Gurdas 40001+, Sarbloh 900001-901559, Nand Lal
-- 910061, Gur Sobha 920001-920483. BaniDB has this vaar as its source S (41000-41027, not loaded here);
-- writer_id 49 is BaniDB's Bhai Gurdas Singh Ji.
--
-- The lines themselves are loaded by `npm run load:gurdas-singh-vaar` (or its build's load SQL), not here.

insert into source_rights (code, visibility, rights_status, notes) values
  ('gurdas_singh_vaar_2008', 'curator', 'pending',
   'Typed text of unknown provenance (GurbaniLipi, OpenOffice, January 2008; no title page or imprint): the verse is public domain, the typing''s rights holder is unknown')
on conflict (code) do nothing;

-- id 8 pinned, as 071 pinned 7: production and a fresh replay must agree.
insert into sources (id, code, name, version, description, slug, kind, tier, rank, page_unit,
                     searched_by_default, author, external_refs)
values (
  8, 'gurdas_singh_vaar_2008',
  'Vaar Bhai Gurdas Singh (Vaar Sri Bhagauti Ji Ki)',
  'gurbanilipi-2008',
  'Bhai Gurdas Singh''s vaar ''Vah vah Gobind Singh aape gur chela'', 28 pauris (1-20 pauri, 21-28 chaupai), one row per tuk, from "Vaar Bhagauti - Bhai Gurdas Singh.pdf", a GurbaniLipi typed text (2008) with no imprint. Kept as typed, misprints included. Curator-only until its rights are settled.',
  'gurdas-singh-vaar', 'poetry', 'historical', 35, 'Page',
  false, 'Bhai Gurdas Singh Ji', '{"banidb": "S"}'::jsonb
)
on conflict (code) do nothing;
select setval('sources_id_seq', (select max(id) from sources));

insert into shabads (id, writer_english, writer_id, ang_start, source_fk)
select v.id, 'Bhai Gurdas Singh Ji', 49, v.ang, (select id from sources where code = 'gurdas_singh_vaar_2008')
  from (values
(930001, 1), (930002, 1), (930003, 1), (930004, 1), (930005, 2), (930006, 2), (930007, 2), (930008, 3), (930009, 3), (930010, 3),
(930011, 3), (930012, 4), (930013, 4), (930014, 4), (930015, 5), (930016, 5), (930017, 6), (930018, 7), (930019, 8), (930020, 9),
(930021, 9), (930022, 10), (930023, 11), (930024, 12), (930025, 13), (930026, 13), (930027, 14), (930028, 15)
  ) v(id, ang)
on conflict (id) do nothing;
