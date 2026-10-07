# Sri Sarbloh Granth: collation and the public-domain base (2026-10-07)

## Plan
The canonical text rests on the **1878 CE Bhai Chanda Singh bir** (public domain). The typed **Budha Dal**
text (BD) supplies words and word division. Readings that differ from Jasvant Singh's **critical edition**
(CE, Hazur Sahib base) are checked against the manuscript images. See `../pilots/sarbloh-manglacharan.md`.

## Files
- `ms1878-page-index.json`: 234 manuscript pages (every 4th page of PDF pp. 63–995) with each page's
  transcribed larivaar opening and its position (`pada`) in the BD half-line sequence. Every page scored
  ≥ 70 with `locate`, and positions rise monotonically. `pagesFor()` turns any BD half-line into the 2–3
  manuscript pages to look at.
- Source texts and outputs live in `../data/sarbloh/` and are git-ignored, because edition copyrights vary:
  - `budha-dal-typed.txt`
  - `bd-core.txt`: BD up to the end of the Manglacharan Purana, half-line 27,749
  - `ce-core.txt`: CE text pages 9–721, OCR, with `[[pN]]` page markers
  - `core-collation.json`
  - `core-variants.json`: definite variants, each with its manuscript pages

## Rebuilding
1. Typed BD: `pdftotext -raw` on `archive.org/download/sarbloh_granth/sarbloh_granth.pdf`, then a
   GurbaniAkhar→Unicode conversion (gurmukhi-utils for now; see thehimmat/gurmukhi-transliterate#14).
2. CE: Tesseract 5 with the `tessdata_best` `pan` model, 300 dpi greyscale, `--psm 6`. Keep pages with more
   than 3 `॥N॥` markers; even pages are the apparatus (variant readings).
3. Run:
   ```
   npm run scans:collate -- collate bd-core.txt ce-core.txt core-collation.json
   npm run scans:collate -- page-index budha-dal-typed.txt openings.json ms1878-index.json
   npm run scans:collate -- variants core-collation.json ms1878-index.json core-variants.json
   ```

## Results: BD core (27,750 half-lines) vs CE (30,975)

| band | half-lines | share |
|---|---|---|
| same, or spelling-only | 17,308 | 62% |
| probable variant (includes OCR noise) | 5,992 | 22% |
| heading (metre / raag labels) | 998 | 4% |
| split (CE breaks the half-line at a single danda) | 867 | 3% |
| missing from CE | 1,940 | 7% |
| **definite variant** | **645** | **2.3%** |

CE also has 5,165 half-lines with no BD partner. These are mostly the other halves of the splits, plus
CE-only lines.

## Structural findings

1. **The avatar section is outside the core.** BD continues for about 8,200 half-lines after the
   Manglacharan Purana's colophon (half-line 27,749). That material runs:
   - Machh through Parasram avatars;
   - a seven-kanda Ram Charit;
   - Dasam Skandh.

   The 1878 bir ends with the Purana (its last pages sit at BD ~27,600), and CE gives the avatar material only
   as excerpts in Appendix 3.1.
   **Decision (user, 2026-10-07):** the avatars are stored as a **separate work**, recorded as "part of Sarbloh
   Granth according to Budha Dal". Their text source is BD only until a manuscript witness is found.
2. **CE lacks a block that the 1878 bir has.** BD half-lines ~16,500–19,500 (around the *Samar Geet
   Upasana Kand*) are absent from CE. `locate` scores 38–67 everywhere in CE. The 1878 page index runs straight
   through this block with verified readings. The same holds for the post-text material at BD ~27,350–27,750
   (Granth Mahatam, Bairat Astotar).
3. **The 1878 bir follows the BD recension.** Its verse numbering runs within about 2 of BD's, and all three
   variants checked in the pilot side with BD against CE.

## Next
- Work through `core-variants.json` (645 entries). For each, read the manuscript pages and record the 1878
  reading as canonical. The BD and CE readings become witness variants.
- Spot-check a random sample of "same" lines against the manuscript, to measure the real error rate.
- Speed up `locate` for index building (it currently scans the whole text, taking about 1.6 s per page) by
  limiting the search window.
