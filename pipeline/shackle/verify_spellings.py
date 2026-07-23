#!/usr/bin/env python3
"""
Shackle OCR spelling cross-check (issue #6, part 1).

The 5,959 main-glossary entries carry OCRed Gurmukhi. This script independently
reverse-transliterates each entry's romanized head-word (Shackle reverse engine,
gurmukhi-transliterate#7) and compares the result to the printed Gurmukhi:

  exact     — printed == primary reverse-transliteration
  candidate — printed is among the ambiguity-expanded candidates (corroborated;
              the print just resolved an ambiguity the transcription leaves open)
  divergent — printed matches no candidate → OCR error OR a genuine phonemic-vs-
              orthographic gap → a spelling-QA target, with a suggested correction

Emits data/spelling-check.jsonl (one row per non-exact entry) for the TS persist
step, which scopes the actionable queue to off-corpus words (a divergence on a
corpus-attested spelling is the transliterator's imperfection, not an OCR error).

Usage: python3 pipeline/shackle/verify_spellings.py
"""

import json
import os
import sys
import unicodedata

try:
    from gurmukhi_transliterate import reverse_transliterate, candidate_spellings
except ImportError:
    _sib = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../gurmukhi-transliterate"))
    sys.path.insert(0, _sib)
    from gurmukhi_transliterate import reverse_transliterate, candidate_spellings

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
IN_PATH = os.path.join(DATA_DIR, "glossary-entries.jsonl")
OUT_PATH = os.path.join(DATA_DIR, "spelling-check.jsonl")

nfc = lambda s: unicodedata.normalize("NFC", s or "")


def main():
    if not os.path.exists(IN_PATH):
        sys.exit(f"Not found: {IN_PATH}")

    counts = {"exact": 0, "candidate": 0, "divergent": 0}
    main_total = 0
    with open(IN_PATH, encoding="utf-8") as fin, open(OUT_PATH, "w", encoding="utf-8") as fout:
        for line in fin:
            line = line.strip()
            if not line:
                continue
            e = json.loads(line)
            printed = nfc(e.get("gurmukhi"))
            if not printed:  # appendix (no printed Gurmukhi) — not an OCR check
                continue
            main_total += 1

            result = reverse_transliterate(e.get("headword", ""))
            cands = [nfc(c) for c in candidate_spellings(result)]
            if printed == nfc(result.gurmukhi):
                match = "exact"
            elif printed in cands:
                match = "candidate"
            else:
                match = "divergent"
            counts[match] += 1

            if match != "exact":
                fout.write(json.dumps({
                    "id": e["id"],
                    "gurmukhi": printed,
                    "headword": e.get("headword", ""),
                    "suggested": result.gurmukhi,
                    "candidates": cands,
                    "match": match,
                }, ensure_ascii=False) + "\n")

    pct = lambda n: f"{100 * n / main_total:.1f}%"
    print(f"Main-glossary entries checked: {main_total}")
    print(f"  exact match:      {counts['exact']:>5}  ({pct(counts['exact'])})")
    print(f"  candidate match:  {counts['candidate']:>5}  ({pct(counts['candidate'])})  (printed resolves an ambiguity; corroborated)")
    print(f"  divergent:        {counts['divergent']:>5}  ({pct(counts['divergent'])})  (QA targets → {OUT_PATH})")
    print(f"  corroborated (exact+candidate): {pct(counts['exact'] + counts['candidate'])}")


if __name__ == "__main__":
    main()
