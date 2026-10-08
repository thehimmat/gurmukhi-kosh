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
  - rows holding several printed senses split at their numerals (#140,
    senses.py); numerals left inline for review go to
    output/sense_split_report.jsonl

Usage (from the project root):
  python3 pipeline/mahan-kosh/normalize.py
"""

import copy
import json
import os
from collections import Counter, defaultdict

from pua import clean_pua, find_pua
from senses import load_overrides, split_entry_senses

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "output", "entries.jsonl")
DST = os.path.join(HERE, "output", "normalized.jsonl")
REPORT_NAME = "sense_split_report.jsonl"
MAX_EXAMPLES = 10


def _cp(ch: str) -> str:
    return f"U+{ord(ch):04X}"


def normalize_entry(entry: dict, report: list | None = None, overrides: list | None = None) -> dict:
    """A cleaned copy of one scraped entry; the input is not modified.
    Numerals the sense splitter wants reviewed are appended to `report`."""
    if not entry.get("found"):
        return entry
    out = copy.deepcopy(entry)
    for s in out.get("senses") or []:
        s["definition_text"] = clean_pua(s.get("definition_text") or "")
    out["senses"], notes = split_entry_senses(out["gurmukhi"], out.get("senses") or [], overrides)
    if report is not None:
        report.extend(notes)
    return out


def run_normalize(src: str = SRC, dst: str = DST) -> dict:
    """Normalize every line of `src` into `dst`, and the sense splitter's
    review notes into sense_split_report.jsonl beside it. Returns
    per-code-point counts of glyphs mapped and left over (with example
    `headword#sense` keys), senses split off, and review notes by kind."""
    mapped, left = Counter(), Counter()
    left_examples = defaultdict(list)
    senses_split = 0
    split_report = Counter()
    overrides = load_overrides()
    report_path = os.path.join(os.path.dirname(dst), REPORT_NAME)
    with open(src, encoding="utf-8") as f, open(dst, "w", encoding="utf-8") as out, \
            open(report_path, "w", encoding="utf-8") as rep:
        for line in f:
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            notes = []
            clean = normalize_entry(entry, notes, overrides)
            before = Counter(_cp(c) for s in entry.get("senses") or [] for c in find_pua(s.get("definition_text")))
            mapped.update(before)
            for s in clean.get("senses") or []:
                after = Counter(map(_cp, find_pua(s.get("definition_text"))))
                mapped.subtract(after)
                left.update(after)
                for cp in after:
                    if len(left_examples[cp]) < MAX_EXAMPLES:
                        left_examples[cp].append(f"{entry['gurmukhi']}#{s.get('sense_number')}")
                senses_split += "split_from" in s
            for n in notes:
                split_report[n["kind"]] += 1
                rep.write(json.dumps(n, ensure_ascii=False) + "\n")
            out.write(json.dumps(clean, ensure_ascii=False) + "\n")
    return {
        "mapped": +mapped, "left": left, "left_examples": dict(left_examples),
        "senses_split": senses_split, "split_report": split_report,
    }


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
    print(f"\nSenses split off inline-numbered rows: {stats['senses_split']}")
    for kind, n in sorted(stats["split_report"].items()):
        print(f"  {kind:24s} {n}")
    print(f"\nwrote {DST}")
    print(f"wrote {os.path.join(os.path.dirname(DST), REPORT_NAME)} (numerals to review)")


if __name__ == "__main__":
    main()
