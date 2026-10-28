# Vaar Bhai Gurdas Singh (Vaar Sri Bhagauti Ji Ki)

Corpus `gurdas_singh_vaar_2008`: Bhai Gurdas Singh's vaar *Vah vah Gobind Singh aape gur chela*, 28 pauris,
from a typed GurbaniLipi text. Curator-only.

## Source

- "Vaar Bhagauti - Bhai Gurdas Singh.pdf", Google Drive id `1bK_ozg_3Fy_e4EytWhm65vwuFxLc5pn5`.
- 16 A4 pages, OpenOffice 2.2, January 2008. No title page, imprint or page numbers. It opens on
  `ੴ ਸਤਿਗੁਰਪ੍ਰਸਾਦਿ ॥`.
- One font, GurbaniLipi (the AnmolLipi keyboard layout). Checked against the page images: page 1 in
  full, page 4 in full, and the first lines of page 5.
- BaniDB has the same text as its source S (41000-41027), with the same line count. It differs in
  about 30 lines, mostly spelling (ਸਚੇ/ਸੱਚੇ, ਮਹਿ/ਮੈਂ, nuktas). BaniDB also adds a heading line,
  ਬੋਲਣਾ ਭਾਈ ਗੁਰਦਾਸ ਕਾ. The triage (`pipeline/scans/manifest.yaml`) called the file a minor witness
  to BaniDB S. BaniDB S is not loaded here, so this is the first copy of the vaar in the kosh.

## Decisions

- **Curator-only first.** The verse is public domain. The typing's rights holder is unknown.
  Its `source_rights` row is `curator`, `pending`.
- **Rows.** One printed line is one tuk and one row. Every line closes on ` ॥`. A pauri closes on
  `॥N॥` (printed `॥ N ॥`; only the spacing is changed).
  - The opening ੴ line is row 1, in pauri 1's shabad.
- **No chhand label rows.** The file prints none. Pauris 1-20 are pauri metre and close on the
  refrain. Pauris 21-28 are chaupai and close on ਹੇ ਸਤਿਗੁਰੁ ਮੁਹਿ ਲੇਹੁ ਉਬਾਰਾ.
- **Shabads.** One per pauri, ids 930001-930028.
  - Sarbloh's one-per-chhand-run rule would give one or two shabads here, because the print has no labels.
  - Writer: BaniDB's 49, Bhai Gurdas Singh Ji.
- **Numbering.** `ang` is the PDF page. `verse_id = line_no` is the running row (1-351).
- **Source row.** Id 8, pinned. Tier `historical` and kind `poetry`, as Bhai Gurdas's vaars.
  Rank 35, which reads it just after them.
- **ੴ.** GurbaniLipi draws the whole ੴ on the single key `<`. gurmukhi-transliterate knows only `<>`
  and turns a lone `<` into `Å`. `extract.py` reads a lone `<` as `<>`.

## Misprints, kept as typed

The keys are as typed and the page prints them, so these are the typist's slips, not the converter's:

| page | kept | likely | keys |
|---|---|---|---|
| 4 | ਜਪੀੲੈ | ਜਪੀਐ | `jpIeY` (BaniDB also has ਜਪੀੲੈ) |
| 4 | ਅਨਂਦ | ਅਨੰਦ | `AnNd`: a bindi on ਨ |
| 5 | ਅਪੲਰ | ਅਪਾਰ? (BaniDB ਅਕਾਲ) | `Aper` |
| 12 | ਭਗਿਾ | ਭਗਤਿ | `Bgiw` (BaniDB ਭਗਾਿ) |
| 16 | ੳਹਿ | ਓਹਿ / ਉਹਿ | `aih` |

## Build and load

1. Download the PDF from Drive. Then run:
   `python3 pipeline/gurdas-singh-vaar/extract.py <vaar.pdf> <extract.jsonl>`.
   It needs pdfminer.six and gurmukhi-transliterate.
2. `npm run build:gurdas-singh-vaar -- <extract.jsonl> <out.json> <load.sql>`. It prints 351 lines,
   28 shabads, last pauri 28, pages 1-16, 2,238 tokens and 1,049 distinct, with 0 problems.
3. Apply migration 077, then load:
   `npm run load:gurdas-singh-vaar -- <out.json>` (needs `NEXT_PUBLIC_SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY`). It loads through `pipeline/shared/load-lines.ts` and runs the four
   refreshes. Where only SQL reaches the database, run `<load.sql>` and the refreshes instead
   (see `pipeline/gur-sobha/README.md`).
4. Fill the new words' `ipa_display` and `search_fold` (`npm run pronounce`, `npm run searchfold`).

## Tests

```
npx vitest run tests/gurdas-singh-vaar.test.ts tests/db/gurdas-singh-vaar-source.test.ts
python3 pipeline/gurdas-singh-vaar/test_extract.py
```
