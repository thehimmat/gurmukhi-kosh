-- One-off repair, 2026-10-28. tests/selfhost/gateway.test.ts used to upsert fixture dictionary
-- sources by real codes, which renamed two real ones when check.sh ran it against the server on
-- 2026-10-27. These are the names production (Supabase) had at cutover. The test now uses fixture
-- codes of its own and checks it leaves the real rows unchanged.
begin;
update dict_sources set name = 'Mahan Kosh (Bhai Kahn Singh Nabha)'
 where code = 'mahan_kosh' and name = 'Mahan Kosh';
update dict_sources set name = 'A Guru Nanak Glossary (Christopher Shackle)'
 where code = 'shackle' and name = 'A Guru Nanak Glossary';
select code, name from dict_sources where code in ('mahan_kosh', 'shackle') order by code;
commit;
