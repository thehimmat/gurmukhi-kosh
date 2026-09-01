---
id: US-003
title: Trust every datum through visible source citations/provenance
status: delivered
created: 2026-07-22
updated: 2026-08-31
linked_issues: []
linked_tests: []
supersedes: null
superseded_by: null
---

## Story

As a scholar/learner, I want each datum labeled with its source and provenance (scholar-cited vs rule-derived vs inference), so I never mistake an AI guess for authority.

## Acceptance criteria

- Each datum is labeled with its source and provenance.
- Provenance distinguishes scholar-cited, rule-derived, and inference.
- Labeling is visible to the user so authority is never assumed for an AI guess.

## Evidence

- `ProvenanceBadge`, commits `501d1d6` / `fe17c09`.

## Notes

Related: provenance-principle.md.

## Assessment (2026-08-31)

Upgraded partial → delivered. This is now the app's strongest area:

- Every definition group carries a ProvenanceBadge and a source link; grammar
  readings are decomposed per attribute with per-attestation source labels,
  citations, and tier text ("Read from a cited source" / "Established grammar
  rule" / "Our grouping heuristic").
- Readings resting on unverified rules render dashed with an explicit
  "Unverified rule — our inference" chip; conflicts show both readings and
  only ever demote our own (show-dont-adjudicate).
- Etymology distinguishes Kahn Singh's printed origin markers (a citation)
  from our external-dictionary lookups ("our lookup — best judgment").
- The JSON API ships `grammar_caveats` so consumers inherit the framing.

Residuals (noted, not blockers): the Usage tab's bigrams/collocations carry
no provenance label (they read as plain statistics), and every enrichment row
is still review_status=unreviewed — provenance is labeled, scholar review has
not happened.
