-- 008_writer_stats_name.sql
-- word_writer_stats (migration 006) stored only writer_id, but there is no
-- writers table — the human-readable name lives on shabads.writer_english.
-- Redefine the matview to carry the name so the word page / API can show
-- "most used by <writer>" without a second lookup. min() guarantees one name
-- per (word_id, writer_id) for the unique index. Idempotent.

drop materialized view if exists word_writer_stats cascade;
create materialized view word_writer_stats as
select
  w.id            as word_id,
  s.writer_id,
  min(s.writer_english) as writer_english,
  count(*)        as occurrence_count
from words w
join word_occurrences wo on wo.word_id = w.id
join lines l            on l.id = wo.line_id
join shabads s          on s.id = l.shabad_id
where s.writer_id is not null
group by w.id, s.writer_id;
create unique index if not exists word_writer_stats_idx
  on word_writer_stats (word_id, writer_id);
grant select on word_writer_stats to anon;
