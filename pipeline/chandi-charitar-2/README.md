# Chandi Charitar II (Punjabi-translated Dasam Granth extract)

Corpus `chandi_charitar_2_dg`: Chandi Charitar II, 8 chapters, 262 verses, as printed on pp. 131-157
of a Punjabi-translated Sri Dasam Granth. A second witness to the Dasam Granth's Chandi Charitar II
(BaniDB D, shabads 7673-7737), to compare editions.

## Source

- Drive: "Chandi_Charitar_Part_2.pdf", id `1Viw3It4-7al6fbN9W75J9KGzFPKW-9us`. 27 PDF pages, each with
  two printed pages side by side: verse left, Punjabi translation right. No title page or imprint;
  the running head reads ਸ੍ਰੀ ਦਸਮ-ਗ੍ਰੰਥ ਸਾਹਿਬ. Made with Acrobat Distiller 3.0.
- Fonts: four unnamed embedded fonts (MSTT31c5cb verse, MSTT31c629/634 labels, MSTT31c5d6
  translation), keyed like Joy. gurmukhi-transliterate's `joy` layout was read off this file
  (è = ੇ, ¤: = ੍ਯ), so no converter change was needed. pdfminer names four bytes by StandardEncoding
  (‘ ’ Ł ⁄); `extract.py` maps them back.

## Decisions

- **Curator-only first.** The verse is public domain; the typing's rights holder is unknown.
- **Only the verse.** The translation, footnotes, running heads and page numbers are left out.
  Kept as rows: the opening rubric, chhand labels, chapter headings (ਅਥ … ਕਥਨੰ) and colophons.
- **Rows as Dasam Bani, Sarbloh and Gur Sobha have them.** One tuk (half-line) per row, ending in
  ` ॥` or its verse numbers. The print uses `।` throughout; tuk endings become `॥`, verse numbers
  `॥੧॥੩੯॥` (chapter count, running count; chapter 1 prints only one).
- **Shabads** follow Sarbloh's rule (`sarbloh/lines.ts` `sectionIndexes`), plus a new one at each
  chapter: 64, ids 940001-940064. BaniDB has 65.
- `ang` is the printed page (PDF page + 130). `verse_id = line_no` is the running row number.
- Source id 9 pinned, tier `gurbani`, rank 15 (after the Dasam Granth), writer 47.

## Typing slips repaired (`lines.ts` `cleanText`), each checked against the page image

- Footnote marks set in the verse or label font: ਰਸਾਵਲ¹ (p. 148), ਸਸਤ੍ਰੁ¹ (p. 151).
- A raised spacing mark (key `&`) inside ਉ‐ਠੇ (p. 133), ਮੰ‐ਡੇ, ਉ‐ਚੰ ×2 (p. 136). Read as nothing.
- A stray dot: ਅਭੂਤੰ .ਭਯਾਣੰ (p. 139). ਜਾਰੇੇ typed with two lavan (p. 148).

## Kept as printed

Spellings that differ from BaniDB, e.g. ਧੂਮਨੈਨ (p. 135 heading), ਸਤ੍ਰੂਹੰਤੀ (p. 156), ਰਸਾਲਵ (p. 140).

## Build and load

1. Download the PDF from Drive. Then run:
   `python3 pipeline/chandi-charitar-2/extract.py <Chandi_Charitar_Part_2.pdf> <extract.jsonl>`
   (needs pdfminer.six and gurmukhi-transliterate).
2. `npm run build:chandi-charitar-2 -- <extract.jsonl> <out.json> <load.sql>`. It prints 1,102 lines,
   64 shabads, 8 chapters, 262 verses, 4,704 words (2,269 distinct) and 0 problems: both verse counts
   run unbroken.
3. Apply migration 077. Then `npm run load:chandi-charitar-2 -- <out.json>` with
   `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set (or run `<load.sql>` and the four
   refresh functions and `refresh_health_stats`, as for Gur Sobha).
4. Fill the new words' `ipa_display` and `search_fold` (`npm run pronounce`, `npm run searchfold`).

## Tests

```
npx vitest run tests/chandi-charitar-2.test.ts tests/db/chandi-charitar-2-source.test.ts
python3 pipeline/chandi-charitar-2/test_extract.py
```
