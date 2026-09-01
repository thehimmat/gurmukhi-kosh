# User stories

Statuses re-assessed 2026-08-31 against live prod data (see each story's
Assessment/Notes section); US-001 re-scoped to SGGS and US-007 created
2026-09-01 per the decision on #90. Acceptance tests are story-tagged under
`tests/stories/` and enforced by `scripts/check-stories.mjs` in CI (#91):
every non-superseded story must be referenced by at least one test.

| ID | Title | Status | Linked issues | Tests |
|----|-------|--------|---------------|-------|
| US-001 | Read every word of SGGS with a full dictionary entry | delivered | — | yes |
| US-002 | Browse and search the corpus to reach any word | delivered | — | yes |
| US-003 | Trust every datum through visible source citations/provenance | delivered | — | yes |
| US-004 | See grammar with scholarly citations grouped by attribute | active | #18, #21 | yes |
| US-005 | See per-line commentary and etymology alongside occurrences | active | #33, #66 | yes |
| US-006 | Flag errors and monitor data quality (curation + admin) | active | #2 | yes |
| US-007 | Full entries across all ingested corpora | active | #96, #66, #26, #40 | yes |
