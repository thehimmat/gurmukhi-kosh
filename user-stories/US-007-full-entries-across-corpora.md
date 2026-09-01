---
id: US-007
title: Full entries across all ingested corpora
status: active
created: 2026-09-01
updated: 2026-09-01
linked_issues: [96, 66, 26, 40]
linked_tests: ["tests/stories/us-007.test.ts"]
supersedes: null
superseded_by: null
---

## Story

As a Gurbani learner, I want every word of every ingested corpus (Bhai Gurdas
Ji Vaaran, Dasam Bani, and future granths such as Bhai Nand Lal) to carry the
same depth of entry — definitions, grammar, etymology — as the SGGS words, so
the dictionary serves the whole early Sikh canon, not just SGGS.

## Acceptance criteria

1. Given any word attested in any ingested corpus, when its word page is
   viewed, then it renders with occurrences, per-corpus counts, and
   pronunciation. (Already true; the regression test keeps it true.)
2. Given per-corpus coverage measurement, when definitions coverage is
   computed for each ingested corpus, then each corpus is within 10
   percentage points of SGGS's definitions coverage.
3. Given per-corpus coverage measurement, when grammar coverage is computed,
   then each corpus reaches at least half of SGGS's grammar coverage share.

## Baseline (2026-09-01, live prod)

| corpus | words | definitions | grammar | etymology |
|---|---|---|---|---|
| SGGS | 29,495 | 48.3% | 45.4% (13,378) | 25.6% |
| Bhai Gurdas Vaaran | 12,461 | 47.0% | 36.5% (4,552) | 28.9% |
| Dasam Bani | 37,907 | 31.9% | 14.3% (5,413) | 15.6% |

Criterion 2: Bhai Gurdas already passes; Dasam Bani fails (gap 16.4 points).
Criterion 3: Bhai Gurdas passes; Dasam Bani fails (14.3% vs the 22.7% bar).
The unmet criteria are recorded as `it.todo` entries in the story test so the
suite stays green while the gap is tracked (see #96).

## Notes

- Created 2026-09-01 per Himmat's decision on #90: US-001 stays the delivered
  SGGS story; this sibling story owns the multi-corpus extension.
- Main levers: more dictionary sources (#66 licensing decisions, #26 broader
  lexicon, #40 SikhRI paused), plus widening the grammar engine's coverage
  beyond its Mahan-Kosh-gated word set.
- Out of scope: per-line commentary for the new corpora (US-005 territory)
  and ingesting Amrit Keertan (never; it is a compilation).
