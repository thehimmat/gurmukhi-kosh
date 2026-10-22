# Drive inventory

Every PDF in the Gurbani folders of the Drive, and what its text layer holds: the list to pick
ingest and comparison work from. Alternate editions, compilations and manuscripts are all listed;
nothing is sorted into canonical or witness here. Read it in `INVENTORY.md` (generated);
`inventory.json` has the same rows for scripts. The curated triage stays in `../manifest.yaml` and is
joined in by Drive id.

## How it was made (2026-10-22)

1. **Walk.** `data/tree.json` is the folder tree under *06 Sikhi & Gurbani* and the two Gurbani
   folders on the Desktop (*Gurmukhi Project 2025*, *Santhya Library*). Only metadata was listed.
2. **Probe.** For each PDF, `classify.py` decides the text layer from its fonts and a text sample:
   - PDFs up to about 4 MB were downloaded and read with `pdffonts` and `pdftotext`. Larger
     downloads crash the Drive connector.
   - Larger ones were read through Drive's own text extraction, which does not OCR.
   - Drive returns nothing for files over about 40 MB. Those are **unindexed**: probe a synced copy
     with `probe_local.py` (Google Drive for desktop).
   - Each result is a line in `data/probes.jsonl`, written by `record.py`. The latest line for a
     file wins.
3. **Build.** `python3 pipeline/scans/inventory/build.py` writes `inventory.json` and `INVENTORY.md`.

## How the text layer is decided

- **Legacy fonts** are named by gurmukhi-transliterate: from the font name when the fonts are known,
  else from the text.
  - Text-only detection keeps an encoding only when its converted words are real: 40% or more of
    them in the Gurbani lexicon.
  - Real legacy text scores about two thirds. Latin OCR of a Devanagari or Gurmukhi page scores under
    a fifth, and is labelled **garbled**.
- **Watermarks don't count.** Scanner and library watermarks, and lines that recur on most pages,
  are dropped before classifying. A scan that carries only a stamp reads as **none**.
- **Glyph ids don't count.** Fonts with no character map (`TTE…t00`) give glyph ids instead of
  letters, so such a file reads as **none** and is flagged as needing OCR.

## Tests

```
python3 pipeline/scans/inventory/test_classify.py
python3 pipeline/scans/inventory/test_build.py
python3 pipeline/scans/inventory/test_probe_local.py
```

They need poppler-utils and gurmukhi-transliterate (`pip install git+https://github.com/thehimmat/gurmukhi-transliterate`).
