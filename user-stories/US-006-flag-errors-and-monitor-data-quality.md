---
id: US-006
title: Flag errors and monitor data quality (curation + admin)
status: active
created: 2026-07-22
updated: 2026-09-01
linked_issues: [2]
linked_tests: ["tests/stories/us-006.test.ts"]
supersedes: null
superseded_by: null
---

## Story

As a user I want to flag a questionable reading; as maintainer I want a health dashboard + moderation queue, so entries improve over time.

## Acceptance criteria

- Users can flag a questionable reading.
- Maintainer has a health dashboard.
- Maintainer has a moderation queue for flagged entries.

## Evidence

- `api/flags`, `admin/flags`, `/health`.

## Notes

Related: #2 (manual annotations ingest).

## Assessment (2026-08-31)

Stays partial:

- Flagging works on definitions and grammar (FlagForm, honeypot + timing
  anti-spam, insert-only RLS); the key-gated /admin/flags queue and /health
  dashboard both work in prod.
- Gap found in this pass: the etymology section renders no FlagForm even
  though `etymology` is a valid flag target table — readers cannot flag an
  etymology row.
- /health has a real bug found in this pass: grammar_conflicts/polysemy are
  computed from an unpaginated fetch of word_grammar (20,541 rows), which
  PostgREST silently caps at 1000 — the displayed counts cover ~5% of rows.
- Structured "propose a value" corrections not built (waiting on real flag
  volume; still 0 organic flags — all 6,130 open flags are our own auto-flag
  measurement pass, 89% resting on the two #21 rules).
- Manual annotations ingest (#2) remains a stub.
