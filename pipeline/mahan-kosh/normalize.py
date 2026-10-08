#!/usr/bin/env python3
"""Mahan Kosh normalize stage: entries.jsonl -> normalized.jsonl.

Sits between the scraper and the parser so the raw scrape is never edited
and every clean-up is re-runnable:

  scrape.py -> output/entries.jsonl       raw, as scraped
  normalize.py -> output/normalized.jsonl  text clean-up (this file)
  parse_shorthand.py --run -> output/parsed.jsonl
  npm run ingest:mahankosh                 reads normalized + parsed

Steps:
  - Private Use Area glyphs from the source font -> Unicode (#150, pua.py)

Usage (from the project root):
  python3 pipeline/mahan-kosh/normalize.py
"""

import copy
import json
import os
from collections import Counter, defaultdict

from pua import clean_pua, find_pua

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "output", "entries.jsonl")
DST = os.path.join(HERE, "output", "normalized.jsonl")
MAX_EXAMPLES = 10


def _cp(ch: str) -> str:
    return f"U+{ord(ch):04X}"


def normalize_entry(entry: dict) -> dict:
    """A cleaned copy of one scraped entry; the input is not modified."""
    if not entry.get("found"):
        return entry
    out = copy.deepcopy(entry)
    for s in out.get("senses") or []:
        s["definition_text"] = clean_pua(s.get("definition_text") or "")
    return out


def run_normalize(src: str = SRC, dst: str = DST) -> dict:
    """Normalize every line of `src` into `dst`. Returns per-code-point counts
    of glyphs mapped and left over, with example `headword#sense` keys."""
    mapped, left = Counter(), Counter()
    left_examples = defaultdict(list)
    with open(src, encoding="utf-8") as f, open(dst, "w", encoding="utf-8") as out:
        for line in f:
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            clean = normalize_entry(entry)
            for raw_s, clean_s in zip(entry.get("senses") or [], clean.get("senses") or []):
                before = Counter(map(_cp, find_pua(raw_s.get("definition_text"))))
                after = Counter(map(_cp, find_pua(clean_s.get("definition_text"))))
                mapped.update(before - after)
                left.update(after)
                for cp in after:
                    if len(left_examples[cp]) < MAX_EXAMPLES:
                        left_examples[cp].append(f"{entry['gurmukhi']}#{raw_s.get('sense_number')}")
            out.write(json.dumps(clean, ensure_ascii=False) + "\n")
    return {"mapped": mapped, "left": left, "left_examples": dict(left_examples)}


def main():
    if not os.path.exists(SRC):
        raise SystemExit(f"corpus not found: {SRC} (run scrape.py first)")
    stats = run_normalize()
    print("Private Use Area glyphs mapped:")
    for cp, n in sorted(stats["mapped"].items()):
        print(f"  {cp}  {n}")
    print(f"  total {sum(stats['mapped'].values())}")
    if stats["left"]:
        print("\nLeft in place (unresolved in pua_map.json, or no target letter):")
        for cp, n in sorted(stats["left"].items()):
            print(f"  {cp}  {n}  e.g. {', '.join(stats['left_examples'][cp])}")
    print(f"\nwrote {DST}")


if __name__ == "__main__":
    main()
