-- 077: Chandi Charitar II, as printed in a Punjabi-translated Sri Dasam Granth (pp. 131-157), as a
-- curator-only corpus: a second witness to Dasam Granth's Chandi Charitar II, for comparing editions.
--
-- See pipeline/chandi-charitar-2/README.md. Numbered 077: 075 is on main and in the open PR #307, 076 in the open PR #316.
-- The file is an extract with no title page or imprint, so who holds rights to its typing is unknown,
-- and the corpus is loaded curator-only (source_rights, 069; corpora, 070) until that is settled.
-- Publishing is one update, then re-run refresh_word_frequencies and refresh_word_corpus_stats, and
-- refresh word_writer_stats:
--   update source_rights set visibility = 'public', rights_status = 'permitted', licence = '…'
--    where code = 'chandi_charitar_2_dg';
--
-- One row per tuk; ang = the printed page. Shabad ids 940001-940064 (one per run of one chhand, or
-- titled section, and per chapter), ours. Ids in use: SGGS 1-5540, Dasam 7402+, Bhai Gurdas 40001+,
-- Sarbloh 900001-901559, Nand Lal 910061, Gur Sobha 920001-920483, Bhai Gurdas Singh 930001-930028
-- (PR #307). writer_id 47 is BaniDB's Guru Gobind Singh Ji, as for Dasam and Sarbloh.
--
-- The lines themselves are loaded by `npm run load:chandi-charitar-2` (or its build's load SQL), not here.

insert into source_rights (code, visibility, rights_status, notes) values
  ('chandi_charitar_2_dg', 'curator', 'pending',
   'Pages 131-157 of an unidentified Punjabi-translated Sri Dasam Granth (no title page or imprint; PDF made with Acrobat Distiller 3.0): the verse is public domain, the typing and translation''s rights holder is unknown')
on conflict (code) do nothing;

-- id 9 pinned, as 071 pinned 7 and 075 pins 8: production and a fresh replay must agree.
insert into sources (id, code, name, version, description, slug, kind, tier, rank, page_unit,
                     searched_by_default, author, external_refs)
values (
  9, 'chandi_charitar_2_dg',
  'Chandi Charitar II (Punjabi-translated Dasam Granth, pp. 131-157)',
  'dg-pp131-157',
  'Chandi Charitar II, 8 chapters, 262 verses, one row per tuk, from "Chandi_Charitar_Part_2.pdf", pages 131-157 of a Punjabi-translated Sri Dasam Granth with no imprint, its verse read from the text layer (a Joy-like font). The translation is not loaded. A few typing slips repaired, misprints kept. Curator-only until its rights are settled.',
  'chandi-charitar-2', 'scripture', 'gurbani', 15, 'Page',
  false, 'Guru Gobind Singh Ji', '{"banidb": "D"}'::jsonb
)
on conflict (code) do nothing;
select setval('sources_id_seq', (select max(id) from sources));

insert into shabads (id, writer_english, writer_id, ang_start, source_fk)
select v.id, 'Guru Gobind Singh Ji', 47, v.ang, (select id from sources where code = 'chandi_charitar_2_dg')
  from (values
(940001, 131), (940002, 131), (940003, 132), (940004, 132), (940005, 132), (940006, 132), (940007, 133), (940008, 133), (940009, 133), (940010, 134),
(940011, 135), (940012, 135), (940013, 135), (940014, 135), (940015, 135), (940016, 135), (940017, 136), (940018, 136), (940019, 136), (940020, 137),
(940021, 137), (940022, 137), (940023, 137), (940024, 139), (940025, 139), (940026, 139), (940027, 139), (940028, 140), (940029, 141), (940030, 141),
(940031, 142), (940032, 142), (940033, 143), (940034, 143), (940035, 143), (940036, 143), (940037, 144), (940038, 144), (940039, 144), (940040, 145),
(940041, 145), (940042, 145), (940043, 145), (940044, 146), (940045, 147), (940046, 147), (940047, 147), (940048, 147), (940049, 148), (940050, 149),
(940051, 149), (940052, 149), (940053, 149), (940054, 149), (940055, 150), (940056, 150), (940057, 150), (940058, 151), (940059, 151), (940060, 152),
(940061, 152), (940062, 152), (940063, 157), (940064, 157)
  ) v(id, ang)
on conflict (id) do nothing;
