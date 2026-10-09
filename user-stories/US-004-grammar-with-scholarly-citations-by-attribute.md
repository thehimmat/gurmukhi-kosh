---
id: US-004
title: See grammar with scholarly citations grouped by attribute
status: active
created: 2026-07-22
updated: 2026-10-09
linked_issues: []
linked_tests: ["tests/stories/us-004.test.ts"]
supersedes: null
superseded_by: null
---

## Story

As a grammar learner, I want POS/gender/number/case with inflected forms grouped under a lexeme, each value cited to the source that states it.

## Acceptance criteria

- Grammar shows POS, gender, number, and case where a source states them.
- Inflected forms are grouped under a lexeme, by memberships a source asserts.
- Every grammar value names the source it was read from. A value no source
  states is left blank; nothing is inferred from a word's spelling (#30).

_Criteria revised 2026-10-04: the third criterion previously read "Grammar data
is cited to Viakaran/pad-arth", which the Viakaran ending rules satisfied only
by inference._

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

## Assessment (2026-10-04)

Direction decided: no guessing (#30). Migration 037 archived every inferred
grammar value into tables the app cannot read:

- The Viakaran ending rules (#21, #27, #54, #117) and the POS copied from
  similarly spelled words are gone from the live tables. Grammar is now 15,488
  rows, all sourced: 7,018 Shackle, 291 pad-arth, 8,179 Mahan Kosh POS markers.
- Words with any grammar: 16,781 → 11,645. 5,341 words lost a case, gender or
  number that only the rules supplied.
- The stem grouping (17,715 word_forms rows, 5,385 lexemes) was archived, so
  "Inflected forms grouped under a lexeme" is now unmet until #18 populates
  word_forms from Shackle's inflection notes.

Status stays partial: criteria 1 and 3 hold for every value shown; criterion 2
waits on #18.

## Assessment (2026-10-09)

Criterion 2 is now met for the forms Shackle lists. The #18 ingest parsed the
1,426 `inflections:` notes into 2,243 forms and linked the 1,959 the corpus
attests: 3,140 word_forms rows over 1,154 lexeme hubs, 1,901 distinct corpus
words, each with Shackle's verbatim label and the 023 feature columns. ਹੋਵੈ
now reaches ਹੋਇ (pres. 3s.).

Coverage is bounded by what Shackle enumerates: his notes list irregular and
notable forms, not whole regular paradigms. Only 24 of the 133 Japji gaps
verified on #158 are linked; the rest (ਕਹੈ, ਜਾਣੈ, ਮਿਲੈ) are regular forms no
source here states. Status stays partial until a second source (#2 manual
closed classes, #24 Viakaran) or the word page's "form of X" display lands.

