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
- **Hanuman Natak**: for the kosh, the 1899 Lahore print is canonical and Kamalroop's typed text is a witness. This is "for our purposes", not a ruling for the wider Panth. Compare the two in gurbani-diff.
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

## Triage results (manifest.yaml)

There are 50 PDFs:
- 17 witnesses
- 11 ingest candidates
- 9 collections
- 10 reference-only
- 3 skipped: a duplicate, a contemporary kavishri booklet, and a personal letter

Gurbani not in BaniDB:
- **Sri Sarbloh Granth.** There are two complete Budha Dal editions:
  - the 1118-page text-only print (`5_6147…pdf`, Panjab Digital Library), which is the easier OCR source;
  - the 1761-page steek, which records variant readings in its footnotes.
  Several Manglacharan and Diwali-pothi files are partial witnesses or collections of it.
- **Nangali Nitnem gutka:** about 17 banis, including Sansahar Sukhmana, Asfotak Kabitt, Bhagauti di Var and Brahm Kavach. The PDF has real text, but in the Satluj font.
- **Bhai Nand Lal:** Joti Bigas (Punjabi), his Rehatnama, Khatima, and Ghazal 61 of the user's edition.
- **Smaller pieces:** Braham Kavach, and some lines from the Sandhia gutka.

Historical ingest candidates: Sri Gur Sobha, Shaheed Bilas, Sau Sakhi, Hanuman Natak, Vichar Sagar, Sankhep Bibek, and the 1898 Uthanka (occasion stories keyed to SGGS shabad first lines).

## Follow-ups found during triage

- **Decisions for the user**
  - Which edition is canonical for Sarbloh: the text-only print or the steek. Both are Budha Dal editions published by Baba Santa Singh:
    - the text-only print is undated but from before 2000;
    - the steek is dated 5 June 2000.
    Budha Dal reserves the rights to the mool bani, so ask before ingesting it.
  - Whether philosophical texts (Vichar Sagar, Sankhep Bibek) get their own tag inside `historical`.
- **Possible BaniDB data issues (Bhai Nand Lal, source N)**
  - Ghazal 1 lacks ਆਮਦਨ, which the metre needs.
  - Rubai 1 lacks ਕਿ.
  - Shabad 30062 duplicates 30060.
  - The user's edition orders ghazals 7–9 differently.
  - Ghazal 52 has 7 couplets in BaniDB against 8 in the scan, and ਕਾਲ looks like a typo for ਫ਼ਾਲਿ.
  - These are worth reporting upstream once checked.
- **Cross-check tool**
  - Accept an expected source and prefer it: Bhai Gurdas quotes SGGS, which caused one false match.
  - Join consecutive BaniDB part-lines, since Dasam passages are often stored as half-lines.
  - Try adding nukta as well as removing it, for when BaniDB has ਖ਼ but the scan has ਖ.
- **Converters**
  - Encodings still unsupported: Satluj (Nangali gutka), DrChatrik/Joy (a Chandi Charitar), Asees (Sri Gur Sobha), AnandpurSahib + UrduNaqsh (Zafarnama, the only file with Persian script; see #120).
  - Bugs in the user's own converter are tracked in thehimmat/gurmukhi-transliterate#14.
- **Incomplete scans**
  - The Hazur Sahib Dasehra pothi stops at printed p.167, so three day-10 items are missing.
  - Vaaran Vol I is missing printed pp. 366–367.
  - Vaaran Vol II has its last pages out of order.
  - The Granthavali excerpt is missing Joti Bigas couplets 1–69.
  - Reet Ratnavali Part 1 is only a 44-page preview.

## Tooling

`npm run scans:check < lines.txt` reads Unicode Gurmukhi sample lines from a section and prints its
BaniDB status (`online` / `partial` / `not_found`), the BaniDB source and shabad ids, and the lines whose
reading differs (`crossref.ts`, tested in `tests/scans-crossref.test.ts`).

Some PDFs carry text in a legacy Gurmukhi font encoding rather than Unicode. That is converted before
lines are checked. The triage used Shabad OS's `gurmukhi-utils` outside the repo, because it is
GPL-3.0 and this repo has no licence chosen yet.

In some sandboxes Node's `fetch` ignores `HTTPS_PROXY`; set `NODE_USE_ENV_PROXY=1` there.
