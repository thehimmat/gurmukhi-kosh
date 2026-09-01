-- Cold-start optimization for Letter Set search.
--
-- The word index (~30k rows) is loaded into each serverless instance on first
-- use. Fetching it through the table API took ~30 sequential round-trips because
-- PostgREST caps a select at 1000 rows — the dominant cost of a cold first search.
--
-- This returns the whole list in ONE request as a single jsonb array (one row,
-- so it bypasses the 1000-row cap), pre-sorted by frequency so the client needs
-- no further sorting.

create or replace function words_index()
returns jsonb
language sql stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', id, 'gurmukhi', gurmukhi, 'frequency', frequency)
      order by frequency desc, id
    ),
    '[]'::jsonb
  )
  from words;
$$;

grant execute on function words_index to anon;
