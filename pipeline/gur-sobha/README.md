# Sri Gur Sobha (Kavi Sainapati)

Corpus `gur_sobha_iss`: Sainapati's Sri Gur Sobha (completed Bhadon Sudi 15, Sammat 1758, i.e. 1701 CE),
20 chapters, 935 verses, as printed by the Institute of Sikh Studies.

## Decisions (agreed 2026-10-22)

- **Edition:** the Institute of Sikh Studies edition (Chandigarh, 2014; tr. Kulwant Singh). The PDF
  has Google Drive id `14ER61YCHhfk9bknSd8-wJDx44yVTTCFN`. It has a clean text layer; the Pardesi
  Malwa Press print (ed. Akali Kaur Singh Nihang) has only garbled OCR.
  - Other editions are to be ingested later, to compare readings and find errors and editorial
    differences.
- **Private first.** The verse is public domain, but this typed text and its readings belong to the
  edition. The source is loaded with `visibility = 'private'` until permission is settled, so only
  an admin sees it.
  - The extracted text is not committed. The build reads it from a path.
- **Rows as Dasam Bani and Sarbloh have them.**
  - One tuk per row, ending in ` ॥` or in its verse numbers in Gurmukhi digits. The edition counts
    each verse within its chapter and through the work: `॥੩੮॥੭੯॥`.
  - A chhand label is a row of its own (`ਦੋਹਰਾ ॥`), spelled as printed.
  - Shabads follow Sarbloh's rule (`sarbloh/lines.ts` `sectionIndexes`): one per run of one chhand
    or titled section, plus a new one at each chapter. That gives 483.
    - The other option offered was one shabad per numbered verse. Its label said "like Sarbloh",
      but Sarbloh groups by chhand run.
  - `ang` is the printed page (PDF page − 44); `verse_id = line_no` is the running row number.
  - Shabad ids are 920001 onward.
- **Kept as printed:** commas, quotation marks and the edition's verse numbers, misprints included
  (list below). `wordText` drops the punctuation for counting words.

## What is left out

- **The edition's own headings.** Chapter titles (ਦੂਸਰਾ ਅਧਿਆਇ), modern Punjabi summaries
  ((ਭੰਗਾਣੀ ਦਾ ਜੁਧ)) and dates. These are printed bold by overprinting the same text several times,
  which is how `extract.py` tells them apart.
  - The exception is the work's opening rubric on page 2 (ੴ ਸ੍ਰੀ ਵਾਹਗੁਰੂ ਜੀ ਕੀ ਫਤਹਿ, ਸ੍ਰੀ ਗੁਰੁ ਸੋਭਾ
    ਗ੍ਰੰਥ ਲਿਖਯਤੇ, ਅਕਾਸ ਬਾਣੀ). It is printed bold but belongs to the work as copied.
- **The REFERENCES pages,** whose Asees lines quote other works (Bachitar Natak).
- **Everything after the colophon of chapter 20** (notes, bibliography).
- **The romanisation, the English translation and the introduction,** which are set in other fonts.
  - The introduction's Gurmukhi is typed in Joy. That is how the Joy layout's nasal key was found to
    be wrong (gurmukhi-transliterate `fix/joy-nasal-key`).

## Fonts, checked against the page images

| font | where | check |
|---|---|---|
| Asees | the verse, pp. 2–376 | page 2 read against its image at 300 dpi; page 210 line for line |
| Joy | introduction (PDF pp. 38–44), one gloss, one chapter heading | PDF p. 38; its `A` key is the nasal (ਮੈਂ, ਸੋਂ, ਤੈਂ, ਜਯੋਂ, ਨਹੀਂ: all 7 in the book) |
| GurbaniLipi | SGGS quotations in a note (PDF p. 421) | read against its image |

## Typing slips repaired (`lines.ts` `cleanText`)

Each slip was checked against the page image or the edition's romanisation.

- **`||` typed for `]]`** converts to ਫ਼ਫ਼: it is ॥ (4 lines).
- **`.` (।) typed before a verse number** is ॥: `ਕਾਮ। 21॥317॥` (4 lines).
- **A vowel sign typed twice** is one: ਮਾਰੇੇ, ਸੋੋਈ, ਦੇਹੁੁ (9 lines). ੈ stacked with ੇ prints as ੈ: ਕਰੈ,
  ਕੈ, ਲੈ (3 lines).
- **A kanaura after another vowel sign** is the closing quote `"` typed in Asees. The edition
  romanises the four cases as lîjiyai’’, abai’’, sri’ and parsâdi’’.
- **ਮਿਲਿਾਇ prints ਮਿਲਾਇ.**
- **Addak before aunkar** is put after it, as Unicode orders them.

## The edition's misprinted verse numbers (kept)

`build.ts` checks both counts. There are 31 breaks, and on none of them do both counts break at once.
So no line was lost or doubled: in each case one count runs on and the other is misprinted. Examples:

- running 55 → 57 (ch. 2, p. 22)
- 105 twice (ch. 4, p. 50)
- 424 for 524 (ch. 12, p. 216)
- 491 for 591 (ch. 13, p. 246)
- 649 for 659 (ch. 14, p. 270)
- chapter verse 85 for 45 and 90 for 60 (ch. 20, pp. 358, 364)

Run the build to see the full list.

## Build and load

1. Download the PDF from Drive. Then run:
   `python3 pipeline/gur-sobha/extract.py <gur-sobha.pdf> <extract.jsonl>`
   It needs pdfminer.six and gurmukhi-transliterate with the Joy fix; Asees is unaffected by it.
2. `npm run build:gur-sobha -- <extract.jsonl> <out.json> <load.sql>` writes the rows and the SQL
   that loads them. It prints 3,708 lines, 483 shabads, 20 chapters, 23,736 words (4,789 distinct)
   and the numbering breaks.
3. Apply the source migration, then run `<load.sql>`. Then run `refresh_word_frequencies`,
   `refresh_word_corpus_stats`, `refresh_word_corpus_writer_stats` and `refresh_line_first_letters`.
4. Fill the new words' `ipa_display` and `search_fold` (`npm run pronounce`, `npm run searchfold`).

## Tests

```
npx vitest run tests/gur-sobha.test.ts
python3 pipeline/gur-sobha/test_extract.py
```
