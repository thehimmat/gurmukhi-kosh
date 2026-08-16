-- 029: third corpus (#65/#70) — Dasam Bani via BaniDB v2 (SourceID D,
-- angs 1-1428; shabadIds 7402+ sit between SGGS's 1-5540 and Bhai Gurdas's
-- 40001+, so the shared shabads table cannot collide). Named "Dasam Bani"
-- following BaniDB's own SourceEnglish.
insert into sources (code, name, version, description)
values (
  'dasam_banidb_v2',
  'Dasam Bani',
  'banidb-v2',
  'Dasam Bani (1428 angs) fetched from the BaniDB v2 API (SourceID D).'
)
on conflict (code) do nothing;
