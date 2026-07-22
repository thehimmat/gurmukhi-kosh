---
id: US-006
title: Flag errors and monitor data quality (curation + admin)
status: partial
created: 2026-07-22
updated: 2026-07-22
linked_issues: [2]
linked_tests: []
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
