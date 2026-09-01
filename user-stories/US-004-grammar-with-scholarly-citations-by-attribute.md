---
id: US-004
title: See grammar with scholarly citations grouped by attribute
status: partial
created: 2026-07-22
updated: 2026-08-31
linked_issues: []
linked_tests: []
supersedes: null
superseded_by: null
---

## Story

As a grammar learner, I want POS/gender/number/case with inflected forms grouped under a lexeme and cited to Viakaran/pad-arth.

## Acceptance criteria

- Grammar shows POS, gender, number, and case.
- Inflected forms are grouped under a lexeme.
- Grammar data is cited to Viakaran/pad-arth.

## Evidence

- `pipeline/grammar/`, commits `c45d877` / `451f707`.

## Assessment (2026-08-31)

Downgraded delivered → partial, on a strict reading of the criteria:

- POS/gender/number/case grouped by attribute with citations: delivered
  (`lib/grammar-view.ts`; 20,541 grammar rows, 14,985 words).
- "Inflected forms grouped under a lexeme": only 13,575 words (20.6%) belong
  to any lexeme (4,274 lexemes), and 131 words with multiple word_forms rows
  are silently hidden by the `.maybeSingle()` call on the word page and API
  (known issue, part of #18). The Shackle inflections → word_forms populate
  pass (#18/#30) has not run.
- "Cited to Viakaran/pad-arth": 7,309 rows are scholar-cited; the other
  13,232 are rule-derived, resting partly on the two rules known to be wrong
  as word-level rules (#21), and all rows are review_status=unreviewed. The
  UI frames this honestly (per US-003), but the criterion as written is not
  met.

Gated on the #21/#27/#54 grammar-engine direction decision.
