---
id: US-008
title: Build a word-by-word pad-arth for a selected passage
status: active
created: 2026-10-08
updated: 2026-10-08
linked_issues: [158]
linked_tests: ["tests/stories/us-008.test.ts", "tests/padarth-parse.test.ts", "tests/padarth-align.test.ts", "tests/padarth-pauri.test.ts", "tests/padarth-assemble.test.ts", "tests/padarth-markdown.test.ts"]
supersedes: null
superseded_by: null
---

## Story

As the curator preparing Gurbani classes, I want to select lines, a pauri or a
shabad and get each line broken down word by word with every gloss we hold
(Mahan Kosh, Shackle, Sahib Singh's pad-arth, phrases), so I can build a
pad-arth from sourced data instead of guesswork.

## Acceptance criteria

1. Given a selected SGGS passage, each line is shown in Gurmukhi followed by
   each of its words, in order, with every sense from every dictionary source.
2. Sahib Singh's pad-arth is split into its glossed terms and placed on the
   word or phrase it glosses; terms that fit no word stay visible under their
   line, never dropped or guessed onto a similar word.
3. Phrases (multi-word pad-arth terms and multi-word dictionary headwords) are
   shown as their own items.
4. Where a source has nothing for a word but has its base form, the base
   form's senses are shown and labelled with the base and the basis for it.
5. A pauri is selectable as a unit: lines group into stanzas at their verse
   tally (in Japji, the pauris).
6. The passage can be copied as Markdown.
7. Admin-only (`?key=ADMIN_KEY`) while pre-beta. Choosing senses per line is
   phase 1.5 (#158).

## Notes

Phase 1, PR 1 delivers the pure layer (`lib/padarth/`): pad-arth parser,
term aligner, pauri grouping, passage assembler and Markdown export. The data
fetch and admin UI follow in PR 2.

Base-form links: `word_forms`/`lexemes` are empty since migration 037 archived
the stem-inferred grouping (#30), so the assembler takes base-form links as
input with an explicit basis. Decided 2026-10-09: until source-backed links
exist, PR 2 also offers spelling-variant matches (shared `search_fold` key),
labelled "spelling match, unverified" — admin-only, computed at read time,
never stored. Planned replacement: Shackle inflection links from #18, written
to `word_forms` with `source_code='shackle'`; once they land, spelling matches
should drop to a fallback or go away.
