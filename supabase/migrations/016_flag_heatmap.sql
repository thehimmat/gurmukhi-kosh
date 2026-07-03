-- 016_flag_heatmap.sql
-- Ang-level density for open flags, weighted by how often the flagged word
-- actually occurs at each ang (not just distinct-word count) — the intent is
-- "where will a reader actually run into a flagged/uncertain reading," which is
-- an occurrence-weighted question, consistent with the frequency-sort theme in
-- /admin/flags. flags has no public SELECT (insert-only RLS, migration 014), so
-- this can only be exposed via a security-definer aggregate, same pattern as
-- health_stats() (013) — it returns counts only, never flag content.

create or replace function flag_heatmap()
returns jsonb
language sql
stable
security definer
set search_path = public
set statement_timeout = '20s'
as $$
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
    select l.ang, count(*) as weight
    from flags f
    join word_occurrences wo on wo.word_id = f.word_id
    join lines l on l.id = wo.line_id
    where f.status = 'open'
    group by l.ang
    order by l.ang
  ) t
$$;

grant execute on function flag_heatmap() to anon, authenticated;
