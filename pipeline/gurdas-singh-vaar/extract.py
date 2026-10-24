#!/usr/bin/env python3
"""Extract Bhai Gurdas Singh's vaar from its PDF text layer.

  python3 pipeline/gurdas-singh-vaar/extract.py <vaar.pdf> <out.jsonl>

The PDF is "Vaar Bhagauti - Bhai Gurdas Singh.pdf" (Google Drive id
1bK_ozg_3Fy_e4EytWhm65vwuFxLc5pn5): 16 A4 pages typed in GurbaniLipi (an AnmolLipi-layout font)
in OpenOffice, 2008, with no title page or imprint. Every run is the text, so nothing is filtered by
font. Runs are converted to Unicode by gurmukhi-transliterate.

Writes one JSON object per printed line: {"page": PDF page, "y": baseline, "raw": GurbaniLipi keys,
"gurmukhi": Unicode}, in reading order. The pauris are parsed from this by lines.ts.

Needs pdfminer.six and gurmukhi-transliterate.
"""

import json
import logging
import re
import sys
from dataclasses import dataclass

SAME_BASELINE = 2.0
LAYOUT = "anmollipi"


@dataclass(frozen=True)
class Run:
    raw: str
    x: float
    y: float
    x1: float


@dataclass(frozen=True)
class Line:
    raw: str
    gurmukhi: str
    y: float


def convert(raw: str) -> str:
    """GurbaniLipi keys → Unicode. A lone '<' is the whole ੴ in this font (page 1's image)."""
    from gurmukhi_transliterate.legacy import GurmukhiLegacy
    raw = re.sub(r"<(?!>)", "<>", raw)
    logging.disable(logging.WARNING)
    try:
        return GurmukhiLegacy.to_unicode(raw, LAYOUT)
    finally:
        logging.disable(logging.NOTSET)


def page_lines(runs: list[Run]) -> list[Line]:
    """A page's runs as lines, top to bottom (PDF y grows upward), runs on one baseline joined."""
    rows: list[list[Run]] = []
    for r in sorted(runs, key=lambda r: -r.y):
        if rows and abs(rows[-1][0].y - r.y) <= SAME_BASELINE:
            rows[-1].append(r)
        else:
            rows.append([r])
    out = []
    for row in rows:
        row.sort(key=lambda r: r.x)
        raw = " ".join(r.raw.strip() for r in row)
        out.append(Line(raw, convert(raw), round(row[0].y, 1)))
    return out


def pdf_runs(pdf: str):
    """(page number, [Run]) for each page, from pdfminer's text lines."""
    from pdfminer.high_level import extract_pages
    from pdfminer.layout import LTChar, LTTextLine

    def text_lines(o):
        if isinstance(o, LTTextLine):
            yield o
        elif hasattr(o, "__iter__"):
            for c in o:
                yield from text_lines(c)

    for number, page in enumerate(extract_pages(pdf), start=1):
        runs = []
        for tl in text_lines(page):
            chars = [c for c in tl if isinstance(c, LTChar)]
            raw = "".join(c.get_text() for c in chars)
            if raw.strip():
                runs.append(Run(raw, chars[0].x0, chars[0].y0, chars[-1].x1))
        yield number, runs


def main(pdf: str, out: str) -> None:
    n = 0
    with open(out, "w") as f:
        for page, runs in pdf_runs(pdf):
            for line in page_lines(runs):
                f.write(json.dumps({"page": page, "y": line.y, "raw": line.raw, "gurmukhi": line.gurmukhi},
                                   ensure_ascii=False) + "\n")
                n += 1
    print(f"{n} lines")


if __name__ == "__main__":
    main(*sys.argv[1:3])
