# Daily catalogue sweep

The runbook for the scheduled sweep. Each run is a fresh session: everything it needs is
here and in `catalogue.json`. One run = one source slice + five wanted works → at most one PR.

## What we're after, in order

1. **Historic witnesses** (manuscripts, lithographs, pre-1947 prints) of wanted works. For a
   work the Sikh tradition rendered from another language (a Purana, the Hitopadesha), the
   Gurmukhi or Braj rendering is the prize, not another copy of the Sanskrit.
2. **Works the catalogue doesn't know**: niche granths, Sikh-court and sampradai literature,
   Gurmukhi texts in Braj, Sant Bhasha, Persian, Sanskrit.
3. **Other versions of works we already have**: further manuscripts, other editions,
   steeks, translations. The user wants every version, to compare later.

Out of scope: modern devotional reprints with no textual interest, audio, articles that only
mention a title (unless they are the sole lead for a wanted work: then a `study` or
`catalogue-record` version).

## Steps

0. **Guard.** If 3 or more open PRs have branches starting `chore/catalogue-sweep-`, stop and
   report "skipped: 3 sweep PRs awaiting review".

1. **Promote merged finds.** If `catalogue.json` on main has rows with status `candidate`, they
   came in through merged sweep PRs, so they are accepted, except any the user turned down: read
   the comments and reviews on the 10 most recently merged `chore/catalogue-sweep-*` PRs and
   collect every id on a line starting `reject` (e.g. `reject v-foo w-bar`). Then:
   `python3 pipeline/catalogue/candidates.py promote --reject <ids>` and commit that on today's
   branch as its own commit ("Promote reviewed sweep finds").

2. **Plan.** `python3 pipeline/catalogue/sweep_plan.py <today, America/Los_Angeles>` gives the
   slice and five wanted works.

3. **Search.** Spend most effort on the slice; for each of the five wanted works, also search
   the slice's sources *and* the web generally. Search in roman and Gurmukhi spellings and any
   variant titles. Before reading a lead closely, check it:
   `python3 pipeline/catalogue/candidates.py seen <url> …` (a hit means it's known; skip it).
   - Open every lead's own page. Record only what the page shows: title, script, language,
     date as written (Bikrami fine), scribe/editor, publisher, place, pages/folios, repository,
     shelfmark, item page, direct file, availability. Never guess a date or shelfmark.
   - Search result snippets are not evidence. A lead you can't open goes in the report, not the
     catalogue.
   - Catalogue-mining day: read the reference works (their versions have `type: reference`,
     download through the Drive connector by `drive_id`) and record works they name that the
     catalogue lacks, each as a `catalogue-record` version citing the reference and page.

4. **Record.** Write the finds to a scratch JSON (format: `candidates.py` docstring) and run
   `python3 pipeline/catalogue/candidates.py add finds.json --date <today> --by sweep-<slice key>`.
   Name works by `work_id` when you know them; else `work_title` (+ `gurmukhi`, `authors`).
   Then `python3 pipeline/catalogue/build.py` and the four `test_*.py` files and `schema.py`.

5. **Log.** Append one line to `data/sweeps.jsonl`:
   `{"date", "slice", "wanted_checked": [ids], "queries": [...], "added_works", "added_versions", "skipped": n, "unverified_leads": n}`.

6. **PR**, only if something was added or promoted. Branch `chore/catalogue-sweep-<date>`.
   Body, kept short:
   - one line per find: holding impact first (★ historic copy of a wanted work, ✚ new work,
     + another version), then work, version label, date, script, link, version id;
   - wanted works checked with nothing found;
   - unverified leads worth the user's eye;
   - "To turn something down, comment `reject <id>` here, then merge. Closing without merging
     drops the whole run (and its finds may be proposed again)."
   - a short **Decisions** section: judgment calls made, leads left out and why, open items.
   No attribution lines in commits or the PR.

If nothing was found and nothing promoted, open no PR; report the plan and the queries tried.

## Report (final message)

Slice, wanted works checked, counts (added / skipped as known / unverified), the PR link or
why there's none, and anything that failed, named plainly. Never report a success you didn't verify.
