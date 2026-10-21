-- 067: cheaper mark-only Contains queries.
--
-- 066 sends a query with no trigram (਼, ੍, "੍ ", ਸ਼ alone) through
-- strpos(normalize(gurmukhi, NFD), q), which normalizes every line: 0.5-1 s
-- of CPU each. Warm that is fine, but four such queries passed the anon 3 s
-- timeout on a busy minute after the 066 deploy.
--
-- Now the raw text is checked first, which costs a plain strpos per line, and
-- only lines that pass are normalized. A line can contain the NFD query only if
-- its raw text holds each of the query's characters, where NFD splits
-- the six ready-made nukta letters, so ਼ is also satisfied by any of them and
-- ਸ ਖ ਗ ਜ ਫ ਲ by their nukta forms. Characters outside Gurmukhi get no
-- check (their NFD could come from something else), so the prefilter only
-- ever lets too much through, never too little. The 066 condition still
-- decides the match.
--
-- The two are joined with CASE, not AND: the planner orders ANDed conditions
-- by its cost estimate, rated normalize() the cheaper, and so normalized
-- every line before the prefilter ran (measured: 1.1 s either way).

create or replace function contains_condition(p_query text)
returns text
language plpgsql immutable
as $$
declare
  q     text;
  hay   constant text := 'normalize(l.gurmukhi, NFD)';
  cond  text;
  pre   text[] := '{}';
  c     text;
  alts  text[];
begin
  if p_query is null or btrim(p_query) = '' then
    return null;
  end if;
  q := normalize(p_query, NFD);

  -- A LIKE pattern yields a trigram only from a run of three word characters.
  -- The class is Gurmukhi less ਼ and ੍ (pg_trgm's own word characters there).
  if q ~ U&'[\0A01-\0A03\0A05-\0A39\0A3E-\0A4C\0A51\0A59-\0A5E\0A66-\0A75]{3}' then
    cond := format('%s like %L', hay,
      '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%');
  else
    for c in select distinct ch from regexp_split_to_table(q, '') ch loop
      alts := case
        when c = U&'\0A3C' then array[c, U&'\0A33', U&'\0A36', U&'\0A59', U&'\0A5A', U&'\0A5B', U&'\0A5E']
        when c = U&'\0A32' then array[c, U&'\0A33']
        when c = U&'\0A38' then array[c, U&'\0A36']
        when c = U&'\0A16' then array[c, U&'\0A59']
        when c = U&'\0A17' then array[c, U&'\0A5A']
        when c = U&'\0A1C' then array[c, U&'\0A5B']
        when c = U&'\0A2B' then array[c, U&'\0A5E']
        when c ~ U&'^[\0A00-\0A7F ]$' then array[c]
      end;
      -- One character class is cheaper per line than an OR of strpos calls.
      -- Only Gurmukhi and space get here, so nothing needs escaping in it.
      if cardinality(alts) = 1 then
        pre := pre || format('strpos(l.gurmukhi, %L) > 0', c);
      elsif alts is not null then
        pre := pre || format('l.gurmukhi ~ %L', '[' || array_to_string(alts, '') || ']');
      end if;
    end loop;
    cond := format('strpos(%s, %L) > 0', hay, q);
  end if;

  -- Some occurrence must not be followed by a nukta. `|| ''` keeps the
  -- planner off the trigram index for this regex, which may have no trigram.
  if right(q, 1) <> U&'\0A3C' then
    cond := cond || format(' and (%s || '''') ~ %L', hay,
      regexp_replace(q, '([.^$*+?(){}|\[\]\\])', '\\\1', 'g') || U&'(?!\0A3C)');
  end if;

  if cardinality(pre) > 0 then
    cond := format('case when %s then %s else false end', array_to_string(pre, ' and '), cond);
  end if;
  return cond;
end;
$$;
