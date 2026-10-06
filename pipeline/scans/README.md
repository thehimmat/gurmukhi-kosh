# Scanned texts: triage

The user's own scans (PDFs in the Google Drive folder *Gurbani Docs / Santhiā*) are being triaged before
anything is ingested. `manifest.yaml` records, per PDF: what it is, its edition and scan quality, its
sections with PDF page ranges, and whether each Gurbani section is already in BaniDB.

The PDFs themselves are not committed. They are fetched from Drive by id when needed.

## Decisions (agreed 2026-10-06)

- **One canonical text per work, and BaniDB is the default.** Word counts and every other statistic come
  only from canonical lines (`lines`). A per-work override is allowed where a scholar's edition should
  win.
- **Other editions are witnesses.** A scan of a text BaniDB already has is stored *beside* the
  canonical text for comparing readings: each witness line is aligned to a canonical line, with its page
  and how it differs. Witnesses never feed counts. Variant readings are worth studying, so record them
  rather than discarding them.
- **A text with no online source becomes canonical from the best scan.** It is marked as unverified OCR
  until reviewed, the same way the Shackle import is.
- **Compilations are collections.** A pothi or gutka (Dusshera Mahatam Pothi, nitnem gutkas) is an
  ordered list of references into canonical texts, plus its own headings, rubrics and occasion. A
  compilation's own wording is kept as a witness. Collections never change counts, but they can be
  used as a filter.
- **Every scripture is a first-class corpus**, filterable at every stage. SGGS is the core corpus, not
  the only one.
- **Tiers**: `gurbani` (scripture), `historical` (Sikh literature: Sri Gur Sobha, Shaheed Bilas,
  rehatnamas, sakhis…), `reference` (pronunciation and santhiya guides, prosody, music, lessons).
  Reference material never counts toward word statistics; it can feed the pronunciation module.

## Not decided yet

- The schema for witnesses and collections, which is drafted after triage once the kinds of
  variation are known.
- OCR for scans that have no usable text layer.
- Persian originals of Bhai Nand Lal's works, tracked in issue #120.

## Tooling

`npm run scans:check < lines.txt` reads Unicode Gurmukhi sample lines from a section and prints its
BaniDB status (`online` / `partial` / `not_found`), the BaniDB source and shabad ids, and the lines whose
reading differs (`crossref.ts`, tested in `tests/scans-crossref.test.ts`).

Some PDFs carry text in a legacy Gurmukhi font encoding rather than Unicode. That is converted before
lines are checked. The triage used Shabad OS's `gurmukhi-utils` outside the repo, because it is
GPL-3.0 and this repo has no licence chosen yet.

In some sandboxes Node's `fetch` ignores `HTTPS_PROXY`; set `NODE_USE_ENV_PROXY=1` there.
