---
id: US-002
title: Browse and search the corpus to reach any word
status: delivered
created: 2026-07-22
updated: 2026-09-01
linked_issues: []
linked_tests: ["tests/stories/us-002.test.ts"]
supersedes: null
superseded_by: null
---

## Story

As a user, I want to browse the word list and search by Gurmukhi/romanization, so I can navigate to any word or ang quickly.

## Acceptance criteria

- Word list is browsable.
- Search accepts Gurmukhi and romanization input.
- User can navigate to any word or ang quickly.

## Evidence

- `browse/page.tsx`
- `api/search`
- `ang/[ang]`

## Assessment (2026-08-31)

Holds as delivered. Search is three-tier (exact prefix, folded fuzzy #63,
substring) and romanized input works via the always-on transliteration
keyboard. Browse is frequency-ranked and paginated across all corpora.

Known gaps, tracked elsewhere, that do not break the criteria:
- Ang navigation is URL-only (no ang jump box on the home page).
- `/ang/N` is pinned to SGGS; per-source browse routes for Bhai Gurdas and
  Dasam Bani are #68.
- Direct search on `roman_iso15919` (typing ISO romanization without the
  transliteration keyboard) is not supported.
