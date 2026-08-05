-- 024: structured parse of dictionary senses (issue #32)
--
-- `parsed` holds the deterministic decomposition of definition_text produced
-- by pipeline/mahan-kosh/parse_shorthand.py: language_origins (with etymons),
-- pos markers, structured citations, quote-citation pairs, ਦੇਖੋ xrefs,
-- grammar frames, and the residual prose. Null for dictionary sources that
-- have no parser (or rows ingested before the parser existed).

alter table definitions add column if not exists parsed jsonb;

comment on column definitions.parsed is
  'Structured parse of definition_text (pipeline/mahan-kosh/parse_shorthand.py): language_origins, pos, citations, quotes, xrefs, grammar, residue. Null when no parser covers the source.';
