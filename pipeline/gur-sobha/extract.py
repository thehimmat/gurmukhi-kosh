#!/usr/bin/env python3
"""Extract the Gurmukhi verse of Sri Gur Sobha from its PDF text layer.

  python3 pipeline/gur-sobha/extract.py <gur-sobha.pdf> <out.jsonl>

The PDF is the Institute of Sikh Studies edition (2014; Google Drive id
14ER61YCHhfk9bknSd8-wJDx44yVTTCFN). Its verse is typed in the Asees font: each
even page holds the Gurmukhi with its romanisation (Times), each odd page the
English translation. Only Asees runs are kept, converted to Unicode by
gurmukhi-transliterate. Joy (the editor's headings and introduction) and
GurbaniLipi (quotations in the notes) are not the text and are left out.

Writes one JSON object per line: {"page": PDF page, "y": baseline, "bold": printed
bold (the edition's headings), "raw": Asees keys, "gurmukhi": Unicode}, in reading
order. Structure (chapters, chhands,
verse numbers) is parsed from this by the TypeScript build.

Needs pdfminer.six and gurmukhi-transliterate.
"""

import json
import logging
import sys
from dataclasses import dataclass

# Runs this close are one printed line: on one baseline, or the bold
# overprint of a heading (the same text printed again a fraction of a point away).
SAME_BASELINE = 2.0
OVERPRINT = 1.0
# Pieces of a line closer than this (points) are one word, not two.
SEAM = 0.5
TEXT_FONT = "Asees"


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
    # Printed bold, i.e. overprinted: the edition's own headings (chapter titles,
    # summaries, dates), not Sainapati's text.
    bold: bool = False


def _convert(raw: str) -> str:
    from gurmukhi_transliterate.legacy import GurmukhiLegacy
    logging.disable(logging.WARNING)
    try:
        return GurmukhiLegacy.to_unicode(raw, "asees")
    finally:
        logging.disable(logging.NOTSET)


def page_lines(runs: list[Run]) -> list[Line]:
    """A page's Asees runs as lines, top to bottom (PDF y grows upward)."""
    kept: list[Run] = []
    copies: dict[Run, int] = {}
    for r in runs:
        twin = next((k for k in kept if k.raw == r.raw and abs(k.x - r.x) <= OVERPRINT
                     and abs(k.y - r.y) <= OVERPRINT), None)
        if twin:
            copies[twin] += 1
            continue
        kept.append(r)
        copies[r] = 1
    rows: list[list[Run]] = []
    for r in sorted(kept, key=lambda r: -r.y):
        if rows and abs(rows[-1][0].y - r.y) <= SAME_BASELINE:
            rows[-1].append(r)
        else:
            rows.append([r])
    out = []
    for row in rows:
        row.sort(key=lambda r: r.x)
        raw = row[0].raw.strip()
        for prev, r in zip(row, row[1:]):
            piece = r.raw.strip()
            if r.x <= prev.x1 + SEAM and piece[:1] == raw[-1:]:
                # pieces of one bold line both carry the letter at their seam
                raw += piece[1:]
            elif r.x <= prev.x1 + SEAM:
                raw += piece
            else:
                raw += " " + piece
        out.append(Line(raw, _convert(raw), round(row[0].y, 1), bold=any(copies[r] > 1 for r in row)))
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
            chars = [c for c in tl if isinstance(c, LTChar) and TEXT_FONT in c.fontname]
            raw = "".join(c.get_text() for c in chars)
            if raw.strip():
                runs.append(Run(raw, chars[0].x0, chars[0].y0, chars[-1].x1))
        yield number, runs


def main(pdf: str, out: str) -> None:
    n = 0
    with open(out, "w") as f:
        for page, runs in pdf_runs(pdf):
            for line in page_lines(runs):
                f.write(json.dumps({"page": page, "y": line.y, "bold": line.bold, "raw": line.raw,
                                    "gurmukhi": line.gurmukhi},
                                   ensure_ascii=False) + "\n")
                n += 1
    print(f"{n} lines")


if __name__ == "__main__":
    main(*sys.argv[1:3])
