-- 057: Dr Sant Singh Khalsa's English as its own translation source (#146).
--
-- The viewer's Translation view offers his translation and Bhai Manmohan
-- Singh's. lines.translation_en is BaniDB's `bdb`, a revision of his text
-- that differs on ~13% of lines (sampled angs 1, 100, 500, 900, 1300), so it
-- is shown as "BaniDB English" and his own text is ingested separately:
--   npm run ingest:translations -- --start=1 --end=1430 --sources=ssk_en
insert into translation_sources (code, name, author, language, kind, url, notes)
values (
  'ssk_en',
  'English translation',
  'Dr Sant Singh Khalsa',
  'en',
  'translation',
  'https://api.banidb.com',
  'BaniDB v2 translation.en.ssk, stored verbatim.'
)
on conflict (code) do nothing;
