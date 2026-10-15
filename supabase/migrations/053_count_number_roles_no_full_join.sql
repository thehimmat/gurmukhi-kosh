-- 053: count_number_roles without joining every line.
--
-- 052's version joined number_occurrences to lines and let the planner hash
-- the whole lines table: an unfiltered count for ੧ (8,013 numerals) took
-- 2.1 s as anon, close to the 3 s timeout, and timed out under CI load. The
-- facet filters are now an EXISTS per matching numeral (a primary-key lookup
-- each), skipped entirely when no filter is set. Same results, checked in an
-- aborted DO block against 052's: ੧ unfiltered 47 ms, Dasam only 102 ms,
-- SGGS+Dasam by Guru Nanak Dev Ji 156 ms.
create or replace function count_number_roles(
  p_value    int,
  p_raags    text[]   default null,
  p_writers  text[]   default null,
  p_sources  bigint[] default null,
  p_ang_min  int      default null,
  p_ang_max  int      default null
)
returns table(role text, line_count bigint)
language sql stable
as $$
  with hits as (
    select n.role, n.line_id
    from number_occurrences n
    where n.value = p_value
      and (
        (coalesce(cardinality(p_raags), 0) = 0 and coalesce(cardinality(p_writers), 0) = 0
         and coalesce(cardinality(p_sources), 0) = 0 and p_ang_min is null and p_ang_max is null)
        or exists (
          select 1
          from lines l
          left join shabads s on s.id = l.shabad_id
          where l.id = n.line_id
            and (p_raags   is null or cardinality(p_raags)   = 0 or s.raag_english   = any(p_raags))
            and (p_writers is null or cardinality(p_writers) = 0 or s.writer_english = any(p_writers))
            and (p_sources is null or cardinality(p_sources) = 0 or l.source_fk      = any(p_sources))
            and (p_ang_min is null or l.ang >= p_ang_min)
            and (p_ang_max is null or l.ang <= p_ang_max)
        )
      )
  )
  select r.role, count(distinct h.line_id)::bigint as line_count
  from (values ('author', 1), ('ghar', 2), ('heading_other', 3), ('verse_marker', 4)) as r(role, ord)
  left join hits h on h.role = r.role
  group by r.role, r.ord
  order by r.ord;
$$;
