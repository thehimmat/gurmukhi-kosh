# Bhai Nand Lal: Diwan-e-Goya (Ghazals)

Corpus `nand_lal_ghazals` (migration 061): Bhai Nand Lal's 63 Persian ghazals in Gurmukhi
transliteration, one row per misra.

## Decisions (agreed 2026-10-18)

- **Our edition is canonical, BaniDB is a variant.** The text is "Ghazals Bhai Nand Laal Goyaa
  Complete.pdf" (Google Drive id `1E0Ev6lOwuvTRz41vqw_uC8RzJjMslVSW`, typed GurbaniAkhar). BaniDB's
  Bhai Nand Lal source (N) is not loaded. It differs:
  - BaniDB has no ghazal 61 ("ਗਿਰੀਆਂ ਸ਼ੁਦਾ ਇੰਦਲੀਬ…").
  - BaniDB has ghazal 63 twice, as 30060 (labelled 61) and 30062.
  - BaniDB orders ghazals 7–9 as our 9, 7, 8.
  - Ghazal 52 has 8 shers here and 7 in BaniDB.
  - Ghazal 1 has ਆਮਦਨ here, which the metre needs and BaniDB lacks.
  - Shers are in a different order within ghazals 6, 34, 35 and 52, and one sher of ghazal 26 reads
    differently.
- **Kept as printed.** Punctuation, quote marks (around ਗੋਇਆ) and every nukta stay in `lines.gurmukhi`.
  - Nuktas are precomposed where Unicode has the letter (ਖ਼ ਗ਼ ਜ਼ ਫ਼ ਲ਼ ਸ਼, as the BaniDB corpora write
    them). Other letters keep letter + nukta: ਕ਼ for qaf, ਅ਼ for ain.
  - The only correction is the converter's nukta after a vowel sign (ਕਿ਼), which is moved back onto
    its letter (ਕ਼ਿ).
  - A misra 1 that closes with `?` or `--` gets no added danda. The five shers printed without a mark
    between their misras get ` ।`, as do all the others.
- **Words are counted without the punctuation.** `ghazals.ts` `wordText` strips it before
  `lib/tokenizer`, for this source only, and the shared tokenizer is unchanged (user decision).
  `ਕਿ:` and hyphenated compounds (`ਬ-ਯਾਦ`) stay single words.
  - Because of this, `npm run verify:occurrences` re-tokenizes `lines.gurmukhi` as is and will report
    the ghazal lines that have punctuation as mismatches. That is expected.
- **IDs follow BaniDB where it has the ghazal.**
  - `shabad_id` is BaniDB's ShabadID for the same ghazal (`banidbShabadId`), e.g. our ghazal 9 →
    30006.
  - Ghazal 61 gets 910061, and BaniDB's duplicate 30060 is unused.
  - `ang` is the ghazal number. `verse_id` = `line_no` = the running misra number (1–722).
  - The sher is `sherPosition(k)` for a row's k-th position in its ghazal. The second misra also ends
    in `॥N॥`.
  - Our verse ids are not BaniDB's VerseIDs, because the misras don't align one-to-one (missing ghazal,
    sher order).

## Open items

- **Feature idea: toggle between our reading and BaniDB's.** Let a reader switch the ghazals between
  this edition and BaniDB's text, per line or for the whole page.
  - The shared shabad ids make the ghazal-level join trivial.
  - A line-level join needs the variant stored as a witness, aligned misra by misra. That is the
    witness schema in `pipeline/scans/README.md` ("Not decided yet").
  - The comparison data is from BaniDB `/v2/shabads/30000…30062`.
- The rubaiyan and baints that follow ghazal 63 in the same PDF are not loaded.
- Persian-script originals: #120.

## Build and load

1. `pdftotext -layout` the PDF, then convert each line from GurbaniAkhar to Unicode. The triage used
   Shabad OS `gurmukhi-utils` `toUnicode` outside this repo, because it is GPL-3.0.
2. `npm run build:nand-lal -- <ghazals.txt> <out.json> <load.sql>` writes the rows and the SQL that
   loads them (`pipeline/shared/load-sql.ts`). It prints the line, ghazal, sher and token counts.
3. Apply migration 061, run `<load.sql>`, then `refresh_word_frequencies`,
   `refresh_word_corpus_stats`, `refresh_word_corpus_writer_stats` and `refresh_line_first_letters`.

Tests: `tests/nand-lal-ghazals.test.ts` (fixture: ghazals 1–3) and `tests/load-sql.test.ts`.
