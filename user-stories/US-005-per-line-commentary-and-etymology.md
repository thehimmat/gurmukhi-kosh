---
id: US-005
title: See per-line commentary and etymology alongside occurrences
status: partial
created: 2026-07-22
updated: 2026-08-31
linked_issues: []
linked_tests: []
supersedes: null
superseded_by: null
---

## Story

As a reader, I want cited per-line commentaries (Sahib Singh Darpan, pad-arth, Faridkot, Manmohan Singh) and word-origin chains.

## Acceptance criteria

- Per-line commentaries from Sahib Singh Darpan, pad-arth, Faridkot, and Manmohan Singh are shown and cited.
- Word-origin chains (etymology) are shown alongside occurrences.

## Evidence

- `line_translations` (280k rows).

## Notes

v1; Arabic/Persian glosses incomplete.

## Assessment (2026-08-31)

Stays partial:

- All four named commentaries are ingested and rendered on occurrence cards,
  ordered (Sahib Singh first, Faridkot last), each cited with source, author,
  and caveat. SGGS coverage: Darpan ~55k lines, Manmohan ~60k (pa + en),
  plus pad-arth.
- The two new corpora have zero per-line commentary (75,534 of 135,882 lines
  have none) — the named sources are SGGS commentaries, so this is a scope
  question the story predates rather than a regression.
- Etymology: 14,722 rows across 11,852 words with cited external glosses on
  3,958; still incomplete for Arabic/Persian and gated on #66 (CDIAL/Apte).
- MK witness-quote → line linking (#33) would strengthen the per-line layer
  and is queued.
