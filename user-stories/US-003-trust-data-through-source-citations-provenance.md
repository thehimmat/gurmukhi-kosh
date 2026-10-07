---
id: US-003
title: Trust every datum through visible source citations/provenance
status: delivered
created: 2026-07-22
updated: 2026-10-07
linked_issues: [125, 137]
linked_tests: ["tests/stories/us-003.test.ts"]
supersedes: null
superseded_by: null
---

## Story

As a scholar/learner, I want each datum labeled with its source and provenance (scholar-cited vs rule-derived vs inference), so I never mistake an AI guess for authority.

## Acceptance criteria

- Each datum is labeled with its source and provenance.
- Provenance distinguishes scholar-cited, rule-derived, and inference.
- Labeling is visible to the user so authority is never assumed for an AI guess.
  Amended 2026-10-07 (#125): public visitors see each datum's source by name and
  the full provenance listing on the Sources tab; per-row provenance pills show
  in curator mode (`?key=ADMIN_KEY`).

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

## Addendum (2026-10-04)

Grammar no longer has a rule-derived or heuristic tier (#30, migration 037):
every grammar value shown is read from a named source, and a value no source
states is left blank. The dashed "Unverified rule — our inference" treatment
was removed with the readings it marked. The scholar-cited vs rule-derived vs
inference distinction still applies elsewhere (etymology lookups, IPA).

## Addendum (2026-10-07)

Per-row provenance pills, the unverified-spelling badges and the methodology
paragraphs moved behind curator mode (#125) to declutter public word pages;
the Sources tab keeps every pill publicly and each definition group still
names its source. This is acceptable only because of a stricter direction
recorded in #137: for now nothing AI- or rule-derived should appear on an
entry at all — every datum sourced and independently verified — so the pills
should rarely carry an "inference" signal a reader needs. Until #137's audit
lands (IPA and etymology lookups are still derived), this is a known gap.
