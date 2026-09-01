---
id: US-001
title: Read every word of SGGS with a full dictionary entry
status: delivered
created: 2026-07-22
updated: 2026-09-01
linked_issues: []
linked_tests: ["tests/stories/us-001.test.ts"]
supersedes: null
superseded_by: null
---

## Story

As a Gurbani learner, I want an entry for every unique word of Sri Guru Granth
Sahib Ji across all 1430 angs (definitions, grammar, etymology, occurrences),
so I can read word-by-word, not just search.

## Acceptance criteria

1. Given any word attested in SGGS, when its word page is viewed, then it
   renders the 8-tab layout with its occurrences and pronunciation.
2. Given the SGGS word set, when coverage is measured, then occurrence
   indexing and IPA are complete, and definitions/grammar/etymology carry
   substantial multi-source coverage (best effort across Mahan Kosh, Shackle,
   pad-arth; growing as sources land).
3. Coverage spans all 1430 angs.

## Evidence

- `word/[gurmukhi]/page.tsx` 8-tab layout; all 1430 angs ingested.
- SGGS-scoped coverage (2026-09-01, live prod): 29,495 attested words;
  definitions 48.3%, grammar 45.4%, etymology 25.6%, IPA ~100%.

## Notes

Re-scoped 2026-09-01 per Himmat's decision on #90: this story is and stays
the SGGS story, and it is delivered. Extending the same entry depth to the
other ingested corpora is US-007, a sibling story, not a supersession.
The 2026-08-31 assessment's "partial" reading came from applying the tripled
multi-corpus denominator to this story; that concern now lives in US-007.
