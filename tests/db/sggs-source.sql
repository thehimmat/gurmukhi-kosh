-- The SGGS source row. In production it came from the UNFILED ledger entry add_sources_table
-- (20260521204516), whose table definition was later folded into 001_schema.sql but whose seed
-- row was not. Inserted first so the sources get their production ids (sggs_banidb_v2 = 1).

insert into sources (code, name, version, description)
values (
  'sggs_banidb_v2',
  'Sri Guru Granth Sahib Ji',
  'BaniDB v2',
  'Fetched from https://api.banidb.com/v2 — Unicode Gurmukhi with BDB English translation'
);
