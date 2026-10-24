#!/usr/bin/env python3
"""Extract the verse of Chandi Charitar II from its PDF text layer.

  python3 pipeline/chandi-charitar-2/extract.py <Chandi_Charitar_Part_2.pdf> <out.jsonl>

The PDF is "Chandi_Charitar_Part_2.pdf" (Google Drive id 1Viw3It4-7al6fbN9W75J9KGzFPKW-9us): 27
pages cut from a Punjabi-translated Sri Dasam Granth (printed pp. 131-157, Acrobat Distiller 3.0).
Each PDF page holds two printed pages side by side: the verse on the left, its Punjabi translation
on the right. Its four embedded fonts are unnamed (MSTT31c5cb, …) and keyed like Joy, with ੇ on è
and ੍ਯ typed ¤: (gurmukhi-transliterate's 'joy' layout, which was read off this file).

Kept: the left page's verse font (MSTT31c5cb) and its label font (MSTT31c629/634: the rubric, chhand
labels and colophons). Left out: the translation font (MSTT31c5d6: the translation, footnotes,
footnote marks, running heads and page numbers), any line that opens in it (a footnote), and the
14-point running head ਚੰਡੀ ਚਰਿਤ੍ਰ-੨.

Writes one JSON object per printed line: {"page": PDF page, "y": baseline, "role": "text" or
"label", "raw": keys, "gurmukhi": Unicode}, in reading order. The structure is parsed by lines.ts.

Needs pdfminer.six and gurmukhi-transliterate.
"""

import json
import logging
import sys
from dataclasses import dataclass

# Runs this close are one printed line. pdfminer sometimes sets the rest of a line ~3 points low.
SAME_BASELINE = 4.0
# Pieces of a line closer than this (points) are one word, not two.
SEAM = 0.5
# Between the two printed pages: the verse runs to x = 354, the translation starts at 430.
MIDDLE = 400
LAYOUT = "joy"
TEXT_FONT, LABEL_FONTS, TRANSLATION_FONT = "MSTT31c5cb", ("MSTT31c629", "MSTT31c634"), "MSTT31c5d6"
RUNNING_HEAD_SIZE = 13
# pdfminer names these bytes by Adobe StandardEncoding; the font's keys are their Windows-1252 bytes.
STANDARD = str.maketrans({"‘": "`", "’": "'", "Ł": "\xe8", "⁄": "\xa4"})


@dataclass(frozen=True)
class Run:
    raw: str
    x: float
    y: float
    x1: float
    role: str


@dataclass(frozen=True)
class Line:
    raw: str
    gurmukhi: str
    y: float
    role: str


def convert(raw: str) -> str:
    from gurmukhi_transliterate.legacy import GurmukhiLegacy
    logging.disable(logging.WARNING)
    try:
        return GurmukhiLegacy.to_unicode(raw.translate(STANDARD), LAYOUT)
    finally:
        logging.disable(logging.NOTSET)


def role(font: str, size: float, x: float) -> str | None:
    """'text' (the verse and the work's headings), 'label' (rubric, chhand labels, colophons), or None."""
    if x >= MIDDLE:
        return None
    if TEXT_FONT in font:
        return "text" if size < RUNNING_HEAD_SIZE else None
    if any(f in font for f in LABEL_FONTS):
        return "label"
    return None


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
        raw = row[0].raw
        for prev, r in zip(row, row[1:]):
            raw += r.raw if r.x <= prev.x1 + SEAM else " " + r.raw
        raw = " ".join(raw.split())
        out.append(Line(raw, convert(raw), round(row[0].y, 1), row[0].role))
    return out


def pdf_runs(pdf: str):
    """(page number, [Run]) for each page: the kept runs of pdfminer's text lines."""
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
            chars = [c for c in tl if isinstance(c, LTChar) and c.x0 < MIDDLE]
            first = next((c for c in chars if c.get_text().strip()), None)
            if first is None or TRANSLATION_FONT in first.fontname:
                continue  # a footnote, running head or page number
            run: list = []
            for c in chars + [None]:
                r = role(c.fontname, c.size, c.x0) if c else None
                if run and r != run[0][1]:
                    cs = [ch for ch, _ in run]
                    raw = "".join(ch.get_text() for ch in cs)
                    if raw.strip():
                        runs.append(Run(raw, cs[0].x0, cs[0].y0, cs[-1].x1, run[0][1]))
                    run = []
                if r:
                    run.append((c, r))
        yield number, runs


def main(pdf: str, out: str) -> None:
    n = 0
    with open(out, "w") as f:
        for page, runs in pdf_runs(pdf):
            for line in page_lines(runs):
                f.write(json.dumps({"page": page, "y": line.y, "role": line.role, "raw": line.raw,
                                    "gurmukhi": line.gurmukhi}, ensure_ascii=False) + "\n")
                n += 1
    print(f"{n} lines")


if __name__ == "__main__":
    main(*sys.argv[1:3])
