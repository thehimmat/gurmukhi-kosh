# Sri Sarbloh Granth: collation and the public-domain base (2026-10-07)

## Plan
**Decision (user, 2026-10-07): the Budha Dal print is canonical throughout**, as the present-day authority.
The canonical text is `canon-bd`: the typed BD text with its typing slips corrected against the BD print scan
(see "Three-way triangulation"). The manuscripts (1878 Bhai Chanda Singh, 1698 Mastuana, Mai Bhago) and
Jasvant Singh's critical edition (CE, Hazur Sahib base) are kept as **witnesses**: every place where they
differ is recorded as a variant, and the interesting ones get a note (see "Noted differences").

The earlier plan built the canon on the 1878 bir (`canon-v0`/`canon-v1`, kept for reference); the
manuscript verdicts below now serve as the witness record instead.

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
- print = CE ≠ typed → typing slip, auto-fixed from the print. It is only *suggested* (`probable-slip`) when
  the scans agree on consonants alone or the OCR word is malformed (ਦਿ੍ਗਨ). Both scans went through the same
  OCR engine and share its losses, so a difference those losses explain (dropped nasal, adhak or subscript:
  ਮਹਾਂ→ਮਹਾ, ਪ੍ਰਸਾਦਿ→ਪ੍ਸਾਦਿ) or a pure word-division difference never counts;
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

Inputs: BD print OCR = Panjab Digital Library scan pp. 47–382 and 419–1112 (pp. 383–418 are the volume 2
index), Tesseract as for CE.

| half-lines (27,750) | |
|---|---|
| agreed (spelling aside) | 9,619 |
| heading | 1,679 |
| typing slips only | 3,753 |
| a word still for the manuscript | 12,699 |

| words | |
|---|---|
| typing slips, applied | 5,923 (5,765 outside half-lines the manuscript already ruled on) |
| probable slips, suggested only | 2,389 |
| recension (typed = print ≠ CE) | 12,624 |
| three-way | 4,904 |

- **canon-v1** = canon-v0 + 5,765 applied slip fixes in 4,835 half-lines (list in `canon-v1-slips.json`).
- Hand check of 40 random applied fixes: about 38 right. Most restore conjuncts and letters the typed text
  lost (ਮੰਊ→ਮੰਤ੍ਰਿ, ਇੰਜੀਤ→ਇੰਦਰਜੀਤ, ਦੁੱਧ→ਜੁੱਧ, ਦਾ→ਗਦਾ). The doubtful ones are OCR-dependent (ਸ੍ਵਰਗ→ਸੂਰਗ).
- The typed BD text is noisier than it looks: 8,312 of its 192,515 core words (4.3%, about 1 in 23) are
  corrected or suggested.
- **The remaining 12,000 half-lines are too many to read by hand.** Many "recension" words are probably CE OCR
  noise rather than readings (CE is an OCR text). 2,831 have no aligned print or CE line at all.

## 1698 Mastuana Sahib bir

- The table of contents carries a colophon dated **Sammat 1755** (= 1698 CE).
- Folio numbering starts at 351, so it was probably bound after other material (or is a later volume).
- It runs Manglacharan → Adhyays 1–5 in BD order. Verse numbers drift up to ~10 behind BD.
- **No avatar section.** The text ends with the Purana.
- Appended after it: Zafarnama, Hikayats and other material.
  - Flag: a Zafarnama in a volume dated 1698 is earlier than the usual dating (1705/06); worth checking whether
    the appendix is a later hand.
- One stray leaf is bound out of order.

## In the Kosh (ingested 2026-10-07)

One corpus, `sarbloh_budha_dal` (Sri Sarbloh Granth), ranked after SGGS, Dasam Bani and Bhai Gurdas:
36,000 half-line rows, Budha Dal pages 1–1028, 36,578 words, 236,191 occurrences.

- **Merged (039).** First loaded as two corpora (038): the Granth proper (pages 1–818, 27,804 rows) and the
  avatar section (pages 819–1028, 8,196 rows). The split followed the manuscripts, which end before the
  avatars. Merged on 2026-10-07 (user decision) because Budha Dal, the canonical authority, prints them as
  one Granth. The avatar rows continue the verse_id numbering from 27,805.
- **Text.** Pages 1–818 are `canon-bd`: the typed Budha Dal text with typing slips corrected against the
  print scan. The avatar pages are the typed text as is (no third witness to check slips against).
- **`ang`.** The Budha Dal page. The typed PDF is page-for-page with the print, and each page's printed
  number is read from the page itself.
- **Line shape.** As for Dasam Bani: one half-line per row, ending in ` ॥` or in its verse numbers,
  e.g. `॥੧੦੫॥` or `॥੩੬੬॥੧੧੨੦॥`. `verse_id` = `line_no` = the running row number. No shabad rows.
- **Clean-up** (`pipeline/sarbloh/lines.ts`, tested in `tests/sarbloh-lines.test.ts`):
  - printed page numbers that had run into ~1,000 half-lines (and 77 verse numbers) are removed;
  - `<` → ੴ;
  - symbols the converter left for dandas (ñ ! # { } · _ →, and ਲਲ / ਿਲ beside a number) → ॥;
  - a verse number that lost its danda is moved to the right line;
  - 34 other stray characters (mostly quote marks and full stops) are dropped, and listed by
    `npm run build:sarbloh`.
  - About 22 lines keep a number in the text: mostly headings (ਛਕਾ ੧, ਅਸਟਪਦੀ ੧), plus four stray "੧"
    in the avatars.
- **Typing-slip guard.** A correction never removes two or more consonants. That stopped 98 bad
  "corrections" where the print splits a compound (ਰੰਗਭੂਮਿ → ਭੂਮਿ) or a word was misaligned.
- **Load.** `npm run build:sarbloh -- <out.json>` writes the rows. This container could not reach Supabase,
  so the JSON was served once from a temporary branch and pulled in with the `http` extension. Words and
  occurrences were then built in SQL with `lib/tokenizer.ts`'s rules, followed by
  `refresh_word_frequencies` and `refresh_word_corpus_stats`.
  - The counts matched the TypeScript tokenizer exactly (236,191 tokens, 36,578 distinct).
  - From a machine with `.env.local`, a supabase-js loader would do the same.

## Witness apparatus (`../data/sarbloh/canon-bd-apparatus.json`, local)

```
npm run scans:collate -- apparatus bd-core.txt core-collation.json <resolve-dir> canon-bd-apparatus.json research-notes.json review-notes.json
```

One entry per half-line where another witness differs from `canon-bd` (8,619 of 27,750). Each records the
1878 and CE readings and a kind:

| kind | half-lines | meaning |
|---|---|---|
| ms-agrees-with-ce | 365 | the 1878 bir and CE agree against BD: **noted** |
| ms-own-reading | 62 | the 1878 bir reads differently from both: **noted** |
| not-in-ms | 20 | BD's half-line is not in the 1878 bir: **noted** |
| ce-differs | 6,126 | CE differs. 1878 checked and agrees with BD (noted, not significant), or not checked; many are CE OCR noise |
| not-in-ce | 1,939 | no matching CE line found (not checked; may be OCR or CE's different stanza layout) |
| ce-ocr | 49 | checked: OCR noise only |
| heading | 58 | headings and labels |

- 447 entries are marked significant. Each note says what the other sources have.
- The checks come from the 645 definite variants plus the 42 spot checks that showed a real difference.
- Research notes (`research-notes.json`) replace the automatic note, and can correct a misaligned check.
- Reviewer notes from the review page (`review-notes.json`) are appended.
- The review round stopped at r14 (user, 2026-10-07): BD is canonical, so the remaining items are recorded
  automatically.

## Noted differences
Places worth knowing about if a reading is questioned. The canonical text keeps Budha Dal in every case.

- **Half-line 324 (BD verse 105, Manglacharan Naraj chhand): word order.**
  - BD: ਅਕਾਲ ਮੂਰਤਿ ਸਤਿਨਾਮੁ ਨਾਮਿ ਕੋ ਰਿਝਾਇਯੈ. The same in the earlier Budha Dal print under Baba Santa Singh
    (PDL BK-006527 / archive.org `sarbloh-mul`, verse ੧੦੫), in Kamalroop's 2012 Manglacharan, and in a modern
    handwritten gutka (archive.org `handwritten-sarabloh-and-dasam-gutka`, which copies BD's verse number).
  - Every manuscript has ਸਤਨਾਮ first and ਅਨਾਸ:
    - 1878 bir: ਸਤਨਾਮ ਅਕਾਲ ਮੂਰਤਿ ਅਨਾਸ ਕੋ ਰਿਝਾਈਯੇ (verse 107).
    - 1698 Mastuana bir: the same (spread 9, right page, verse ੧੧੮).
    - Mai Bhago bir: ਸਤਨਾਮ ਅਕਾਲ ਰੂਪ ਅਨਾਸ ਕੌ ਰੀਝਾਈਏ (PDF p.4, right page, verse ੧੨੨).
    - Hazur Sahib (CE base): ਸਤਨਾਮ ਅਕਾਲ ਰੂਪ ਅਨਾਸ ਕੌ ਰੀਝਾਈਏ.
    - Khalsa College, Sangrur and Patiala birs (CE apparatus): ਅਕਾਲ ਮੂਰਤਿ for ਅਕਾਲ ਰੂਪ, order as Hazur Sahib.
  - So BD's order is found only in the Budha Dal print tradition. The one manuscript variant is ਰੂਪ (Hazur
    Sahib, Mai Bhago) vs ਮੂਰਤਿ (the other five).
- **Half-lines 4614–4615 (BD verse 368): a couplet only BD has.**
  - BD: ਕਹੌ ਦੂਤ ਹੇਤੰ ਸੁ ਸੁਰਪਾਲ ਕੇਰੋ / ਪਠੀ ਪਤ੍ਰਿਕਾਯੰ ਭਯੋ ਕੋਊ ਝੇਰੋ.
  - The 1878 bir (p.217) ends verse 368 at ਕਹ੍ਯੋ ਬੋਲ ਲੈ ਦੂਤ ਕੀਨੀ ਪੈਸਾਰੀ ॥੩੬੮॥ and continues with ਕਰੀ ਬੰਦਨਾ…;
    CE (verse 370) is the same.
  - CE also has a couplet BD and 1878 lack, just before: ਦੂਤੋ ਵਾਚ ॥ ਸੁਨੋਂ ਦ੍ਵਾਰਪਾਲੰ ਖਬਰ ਬੇਗ ਦੀਜੈ /
    ਸਮਾਚਾਰ ਮੋਰੀ ਸਕਲ ਅਰਜ ਕੀਜੈ.
  - The typed BD text numbers this verse 369 (twice); the print has 368.
  - Review item r14 showed the wrong lines here (the collation had paired the couplet with a heading); the
    item should have been "absent".

## Next
- With BD canonical, further manuscript reading only adds to the apparatus; a cleaner CE text (better OCR or
  a typed CE) would separate CE noise from real readings more cheaply.
- Spot-check the 2,389 probable slips; many are right but need the correct spelling chosen.
- Speed up `locate` for index building (it currently scans the whole text, taking about 1.6 s per page) by
  limiting the search window.
