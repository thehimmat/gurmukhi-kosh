---
id: US-001
title: Read every word of Gurbani with a full dictionary entry
status: partial
created: 2026-07-22
updated: 2026-08-31
linked_issues: []
linked_tests: []
supersedes: null
superseded_by: null
---

## Story

As a Gurbani learner, I want an entry for every unique word across all 1430 angs (definitions, grammar, etymology, occurrences), so I can read word-by-word, not just search.

## Acceptance criteria

- Each unique word has a dictionary entry covering definitions, grammar, etymology, and occurrences.
- Entry is presented via the 8-tab word layout.
- Coverage spans all 1430 angs.

## Evidence

- `word/[gurmukhi]/page.tsx` 8-tab layout.
- MEMORY.md (23,059 rows / 12,772 words).

## Assessment (2026-08-31, against live prod data)

Downgraded delivered → partial. The story was written when the corpus was SGGS
only; three corpora are now ingested (65,932 words), which changed the
denominator under every coverage number:

- Every word has an entry page with occurrences and pronunciation (IPA on
  65,925 of 65,932 words) — that half of the story holds.
- "Full dictionary entry" does not hold at corpus scale: definitions cover
  23,627 words (35.8%), grammar 14,985 (22.7%), etymology 11,852 (18.0%).
- Mahan Kosh expansion over the new corpora (#74) already ran; remaining
  coverage levers are more sources (#66 licensing decisions, #26 MK
  completeness, SikhRI #40 paused).

The story itself is stale: "all 1430 angs" describes SGGS only. Consider a
superseding story that states the multi-corpus scope and a realistic coverage
target per layer.
