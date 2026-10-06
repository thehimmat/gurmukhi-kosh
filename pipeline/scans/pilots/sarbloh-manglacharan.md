# Pilot: Sarbloh Granth Manglacharan (chhands 1–337), 2026-10-06

The question was whether a canonical Sarbloh text can rest on a public-domain manuscript without
OCRing handwriting: compare digital editions automatically, and look at the manuscript only where
they disagree.

## Sources compared

| id | source | how the text was obtained |
|---|---|---|
| T | Typed Budha Dal text, 2022 (archive.org `sarbloh_granth`) | GurbaniAkhar legacy font, converted to Unicode with no OCR |
| K | Kamalroop Singh's Manglacharan, 2012 (user's Drive, Santhiā) | GurbaniAkhar, converted. The PDF draws each glyph twice, so use plain `pdftotext`, not `-raw` |
| CE | Jasvant Singh, *Shudh Paath* critical edition (archive.org `sarbloh_critical_edition`) | Text layer scrambled. Tesseract 5.3 with the `tessdata_best` Punjabi model, 300 dpi, about 3 s per page. Odd PDF pages are text, even pages are the apparatus |
| M | 1878 CE Bhai Chanda Singh bir (archive.org `sarbloh_granth_bir`) | Read from page images, only for disputed lines. Text starts at PDF p.63; Manglacharan verses 24–28 are on p.66 and 55–63 on p.69 |

Lines were aligned by text, not by verse number, because the numbering differs between versions:
- the closing verse is ॥੩੩੭॥ in T and K but ॥੩੬੧॥ in CE;
- M runs about +2 ahead of T in this stretch.

The unit compared was the half-line (pada). Spelling conventions were folded before comparing: vowel length, word-final short vowels, ਯ/ਇਆ, nukta, halant and pair letters, and the OCR's ੍ਰ↔ੁ confusion.

## Results (1,349 half-lines of T)

| | T vs K | T vs CE |
|---|---|---|
| same, or spelling-only | 97% | 73% |
| probable variant (includes leftover OCR noise) | 0.4% | 19% |
| definite variant | 0.4% | 4% (59) |
| headings / missing | 3% | 3% |

- **T and K are one text.** Both descend from the Budha Dal print, so K is not an independent witness.
- **CE belongs to a different recension.** Its base text is the Hazur Sahib bir. CE also prefers older spellings (ਮਾਇਆ, ਕਰ) where T has later ones (ਮਾਯਾ, ਕਰਿ).
- **About two-thirds of the 59 definite variants are headings:** metre and raag labels, for example ਬਿਸਨੁਪਦ … ਦੂਜੀ ਤਰਹ vs ਬਿਸਨਪਦ. That leaves about 15 genuine textual variants in 337 chhands. All are listed in `sarbloh-manglacharan-variants.yaml`.

## Manuscript checks (M)

| variant | T (Budha Dal) | CE | M (1878) |
|---|---|---|---|
| T 26 / CE 35 | ਮਿਹਰ ਨਜ਼ਰ ਕੀ ਫ਼ਜ਼ਲ ਸੇ | ਮਿਹਰ ਫਜਲ ਕੀ ਨਜਰ ਸੇ | **= T** (p.66) |
| T 59 / CE 76 | 2nd line repeats the refrain ਗੁਪਤਿ ਪ੍ਰਗਟਿ ਸਭ ਘਟਿ ਬਿਖੈ… | ਜਬ ਰਚਨਾ ਖਿੰਚੀ ਸਕਲ ਤਬ ਆਪੇ ਆਪ ਮੁਰਾਰ | **= T** (p.69, ॥੬੧॥) |
| T 110 | ਸਭ ਕਰਤ ਹਰਿ ਕੀ ਸੇਵ | ਸਭ ਕਰਤ ਮਾਇਆ ਸੇਵ | **= T** (p.74, ॥੧੧੨॥) |

So far, then, 3 of 3 checked variants side with T:
- The 1878 bir shares the Budha Dal recension: its verse numbers run close to the print's, and its readings match.
- T's apparent duplicate line at verse 59 is a genuine reading, not a typing slip.

A random spot-check of agreed lines was not done in this pilot.

## Conclusions

1. **Workable without OCRing handwriting.** About 3–4% of half-lines need a manuscript look, and most of those are headings.
2. **For a public-domain base, M + T is the working pair.** T supplies the words and word breaks. M confirms them, and in this sample it agrees with T, so few corrections are expected.
3. **CE is the most valuable witness**, not a second opinion on the same text: it records a different (Hazur Sahib) recension. Its readings should be kept as variants with their manuscript sigla.
4. **Effort for the full granth:**
   - The Manglacharan is about 4% of the granth.
   - Scaled up: about 1,500 definite variants in total, of which about 400 are genuine readings; each needs one look at a manuscript image.
   - The bottleneck is locating each line in M. A page index of M (first and last verse number on each page) is the first thing to build; it can be made by reading the red verse numbers.

## Not yet done

- A random spot-check of agreed lines against M.
- A check of a variant where M might side with CE.
- Repeatable tooling. The pilot scripts were exploratory; the aligner and classifier would go into `pipeline/scans/`, test-first.
