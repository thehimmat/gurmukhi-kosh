#!/usr/bin/env python3
"""
Shackle appendix — Phase A (reverse transliteration).

The 1,226 Later-Gurus appendix head-words (book pp. 277-315) are printed as
romanized transcription only, with no Gurmukhi. To ingest them as lemmas we need
a Gurmukhi form to key `words` on. This script reverse-transliterates each
appendix head-word using the suite's transliterate app (Shackle reverse engine,
gurmukhi-transliterate#7) and writes a derived-Gurmukhi JSONL for the TS ingest.

Output (pipeline/shackle/data/appendix-derived.jsonl): one object per appendix
entry — the original GlossaryEntry with `gurmukhi` / `gurmukhiNormalized` filled
with the DERIVED form, plus:
  _derived: true
  _ambiguities: [{kind, chosen, alternatives, note, source, start}, ...]

The derived Gurmukhi is best-effort (Shackle's roman is phonemic, not 1:1); the
TS ingest tags these words spelling_status='derived_transliteration' and keeps
the ambiguities for human QA (issue #6). Nothing here writes to the DB.

Usage: python3 pipeline/shackle/reverse_appendix.py
"""

import json
import os
import sys

# Import the reverse transliterator from the sibling transliterate app.
try:
    from gurmukhi_transliterate import reverse_transliterate
except ImportError:
    _sibling = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../gurmukhi-transliterate"))
    sys.path.insert(0, _sibling)
    try:
        from gurmukhi_transliterate import reverse_transliterate
    except ImportError:
        sys.exit(
            f"Could not import gurmukhi_transliterate. Expected the app at {_sibling} "
            "or `pip install -e` it. See gurmukhi-transliterate#7."
        )

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
IN_PATH = os.path.join(DATA_DIR, "glossary-entries.jsonl")
OUT_PATH = os.path.join(DATA_DIR, "appendix-derived.jsonl")


def ambiguity_to_dict(a):
    return {k: getattr(a, k, None) for k in ("kind", "chosen", "alternatives", "note", "source", "start")}


def derive_entry(e, reverse=reverse_transliterate):
    """The derived record for an appendix entry, or None if `e` has printed Gurmukhi."""
    # Appendix entries are exactly those with no Gurmukhi in the source.
    if (e.get("gurmukhi") or "").strip():
        return None
    result = reverse(e.get("headword", ""))
    derived = result.gurmukhi
    return {
        **e,
        "gurmukhi": derived,
        "gurmukhiNormalized": derived,
        "_derived": True,
        "_ambiguities": [ambiguity_to_dict(a) for a in (result.ambiguities or [])],
    }


def main():
    if not os.path.exists(IN_PATH):
        sys.exit(f"Not found: {IN_PATH}. Copy the handoff bundle into {DATA_DIR}/.")

    total = 0
    appendix = 0
    with_amb = 0
    with open(IN_PATH, encoding="utf-8") as fin, open(OUT_PATH, "w", encoding="utf-8") as fout:
        for line in fin:
            line = line.strip()
            if not line:
                continue
            total += 1
            out = derive_entry(json.loads(line))
            if out is None:
                continue
            appendix += 1
            if out["_ambiguities"]:
                with_amb += 1
            fout.write(json.dumps(out, ensure_ascii=False) + "\n")

    print(f"Read {total} entries | appendix (no Gurmukhi): {appendix}")
    print(f"Reverse-transliterated {appendix} head-words ({with_amb} carry >=1 ambiguity).")
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
