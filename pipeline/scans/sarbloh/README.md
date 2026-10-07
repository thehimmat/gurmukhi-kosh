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
2. **CE lacks much of a block that the 1878 bir has.** Of BD half-lines ~16,500–19,500 (around the *Samar Geet
   Upasana Kand*), about 1,350 of 3,000 have no CE partner, and `locate` scores 38–67 for them. The 1878 page
   index runs straight through this block with verified readings. The post-text material at BD ~27,350–27,750
   (Granth Mahatam, Bairat Astotar) is similar: 269 of 400 half-lines have no CE partner.
3. **The 1878 bir follows BD's structure but often CE's wording.** Its verse numbering runs within about 2
   of BD's and it has the blocks CE lacks, yet on disputed words it sides with CE more often than BD (below).

## Manuscript verdicts on the 645 definite variants (overnight 2026-10-07)

Each disputed half-line was read in the 1878 bir and judged against BD and CE.

| manuscript supports | half-lines |
|---|---|
| CE | 337 (52%) |
| BD | 132 (20%) |
| neither (a third reading) | 51 |
| both (difference was CE OCR noise) | 49 |
| heading / label only | 58 |
| absent from the manuscript | 18 |

- 83 are flagged `needsReview`: low confidence, neither/absent/unreadable, or a reading that runs past one
  half-line.
- Where the two editions really differ in wording, the 1878 bir sides with CE about 2.5 to 1. The Manglacharan
  pilot (all three checks sided with BD) was not representative. CE wins mostly in the Sanskrit stotras and
  the battle cantos, and where BD garbles conjuncts or merges half-lines.
- **Spot-check:** 120 random half-lines that the collation called "same". 78 matched both editions; 28 sided
  with CE and 2 with BD (single-word differences the half-line band hides, mostly BD typing slips); 12 read
  differently from both. About 6% of all lines are genuine manuscript-only readings (e.g. ਸਮਾਧ, ਨਿਰਤ, ਜੁੱਥ).
  So the 645 definite variants are the tip: roughly a quarter of "same" lines hide a one-word difference.
- **Typed BD has real typos.** The 2022 typed PDF itself prints errors such as ੜ for ਡ (checked against the
  rendered page, not a converter bug). The BD print scan (Panjab Digital Library) does not have them.

## Three-way triangulation (typed BD × BD print OCR × CE)

`triangulate.ts` votes word by word, on a consonant skeleton that ignores vowel spelling, word division and
ra-conjunct spelling (ਛਤ੍ਰ/ਛਤਰ):
- print = CE ≠ typed → typing slip, auto-fixed from the print;
- typed = print ≠ CE → recension difference, left to the manuscript;
- all three differ → left to the manuscript.

Applied to the assembled text with `apply-slips`, where the manuscript has not already ruled.
Results: see "Canonical v0" below.

## Canonical v0 (local, `../data/sarbloh/canon-v0*.{txt,json}`)

```
npm run scans:collate -- assemble bd-core.txt <resolve-dir> canon-v0
npm run scans:collate -- triangulate bd-core.txt bdprint-core.txt ce-core.txt tri-core.json
npm run scans:collate -- apply-slips canon-v0.json tri-core.json canon-v0-variants.json canon-v1
```

<!-- TRIANGULATION-RESULTS -->

## 1698 Mastuana Sahib bir

- The table of contents carries a colophon dated **Sammat 1755** (= 1698 CE).
- Folio numbering starts at 351, so it was probably bound after other material (or is a later volume).
- It runs Manglacharan → Adhyays 1–5 in BD order. Verse numbers drift up to ~10 behind BD.
- **No avatar section.** The text ends with the Purana.
- Appended after it: Zafarnama, Hikayats and other material.
  - Flag: a Zafarnama in a volume dated 1698 is earlier than the usual dating (1705/06); worth checking whether
    the appendix is a later hand.
- One stray leaf is bound out of order.

## Next
- Review the 83 flagged variants.
- Decide how far to read the manuscript beyond the definite variants (see the triangulation counts above).
- Speed up `locate` for index building (it currently scans the whole text, taking about 1.6 s per page) by
  limiting the search window.
