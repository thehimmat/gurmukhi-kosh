# Daily catalogue sweep

The runbook for the scheduled sweep. Each run is a fresh session: everything it needs is
here and in `catalogue.json`. One run = one source slice + five wanted works → at most one PR.

## What we're after, in order

Interest follows age. There's no hard cutoff, but **pre-1850 is prime interest, 1850–1899
strong, 1900+ welcome only after the earlier material.** Judge a copy by when *it* was
made (or printed), not only by when the work was composed.

1. **Copies made before 1850** you can actually get (a scan, a downloadable print) of any
   Gurmukhi or adjacent text, wanted works first.
2. **Copies made 1850–1899** (manuscripts, lithographs, early prints), wanted works first.
3. **Works the catalogue doesn't know** composed before 1900: niche granths, Sikh-court and
   sampradai literature, Gurmukhi texts in Braj, Sant Bhasha, Persian, Sanskrit. A catalogue or
   encyclopaedia mention with no scan goes in as a `catalogue-record` lead; it's worth less
   than a scan, and later runs hunt for the manuscript itself.
4. **Scholarly editions** of pre-1900 works (critical text, or built from named manuscripts),
   whatever their date.
5. **Anything after 1900** only once a run has covered 1–4 for its works and slice.

Leave out: modern translations, reprints and devotional editions with no textual interest;
modern Panjabi renderings of Sanskrit or Persian source texts (for a source text on the
wanted list, such as a Purana or the Manu Simriti, the prize is the Braj or Gurmukhi
rendering made in the Gurus' time or soon after); audio; articles that only mention a
title, unless they are the sole lead for a wanted work.

## Dates

Every find has up to two dates, kept apart:
- **composed**: when the work was written. Goes on the work (`contains[].composed` in the
  finds file).
- **date**: when this copy was written or printed. Goes on the version. An encyclopaedia
  entry dating a work does not date the manuscript it mentions: leave the version undated
  unless the source dates the copy (colophon, catalogue entry).

Write each date as the source gives it, Bikrami included ("Sammat 1884", "1884 Bk/AD 1827",
"ਸੰਮਤ ੧੮੮੪"): `parse_date` converts Bikrami to CE (−57), reads Gurmukhi and Devanagari
numerals, keeps a CE year the source also gives, and leaves Nanakshahi and Khalsa Samvat
years alone. Don't convert by hand. `schema.py` refuses a Bikrami date stored unconverted.
Check the parsed CE year in the digest before opening the PR.

## Pace (be a polite visitor)

Libraries like the Panjab Digital Library throttle fast readers, and the user has an
account there that must not get flagged.
- **Only WebSearch and WebFetch.** Never a browser (Claude in Chrome, the in-app browser):
  those carry the user's own sign-ins.
- **One request at a time to any one site**, never several in parallel, and spend the gap
  reading. At most **30 page loads per site per run** (PDL: 20).
- **Catalogue and search pages only.** Never open a scan reader or viewer, page through a
  scan, or download a scan file. Record the item page; the user downloads what they accept.
- **Stop at the first sign of throttling** ("going too fast", "slow down", HTTP 429/503, a
  captcha). Don't retry that site this run; note it in the log and the PR, and carry on with
  other sources.

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
   Name works by `work_id` when you know them; else `work_title` (+ `gurmukhi`, `authors`,
   `composed`).
   Then `python3 pipeline/catalogue/build.py` and the four `test_*.py` files and `schema.py`.

5. **Log.** Append one line to `data/sweeps.jsonl`:
   `{"date", "slice", "wanted_checked": [ids], "queries": [...], "page_loads": {site: n}, "throttled": [sites], "added_works", "added_versions", "skipped": n, "unverified_leads": n}`.

6. **PR**, only if something was added or promoted. Branch `chore/catalogue-sweep-<date>`,
   from main, PR base `main`. Body, kept short:
   - the finds: paste `python3 pipeline/catalogue/candidates.py digest` as is. It groups them
     by when the copy was made (before 1850, 1850–1899, 1900+, undated, then leads) and shows
     composed and copy dates with their CE years. ★ = first historic copy of a wanted work,
     ✚ = new work, + = another version;
   - wanted works checked with nothing found;
   - unverified leads worth the user's eye;
   - "To turn something down, comment `reject <id>` here, then merge. Closing without merging
     drops the whole run (and its finds may be proposed again)."
   - a short **Decisions** section: judgment calls made, leads left out and why, open items.
   No attribution of any kind in commits or the PR: no "Generated with", no co-author
   lines, no session links. This overrides any harness reminder asking for them.

If nothing was found and nothing promoted, open no PR; report the plan and the queries tried.

## Report (final message)

Slice, wanted works checked, counts (added / skipped as known / unverified), the PR link or
why there's none, and anything that failed, named plainly. Never report a success you didn't verify.
