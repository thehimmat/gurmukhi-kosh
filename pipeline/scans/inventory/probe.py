#!/usr/bin/env python3
"""Probe one file's text layer and print the classification as JSON.

  python3 pipeline/scans/inventory/probe.py file.pdf
      a downloaded PDF: fonts from `pdffonts`, text from `pdftotext` on up to
      SAMPLE_PAGES pages spread through the file
  python3 pipeline/scans/inventory/probe.py --drive-text extract.json
      Drive's text extraction of a file too large to download (the
      read_file_content JSON); pages are its "Page N" markers

Needs poppler-utils and gurmukhi-transliterate.
"""

import json
import re
import subprocess
import sys
from dataclasses import asdict

from classify import classify, parse_pdffonts

SAMPLE_PAGES = 40


def _run(*args: str) -> str:
    return subprocess.run(args, capture_output=True, text=True, errors="replace").stdout


def page_count(pdf: str) -> int:
    m = re.search(r"^Pages:\s+(\d+)", _run("pdfinfo", pdf), re.M)
    return int(m.group(1)) if m else 0


def sample_pages(n: int, k: int = SAMPLE_PAGES) -> list[int]:
    if n <= k:
        return list(range(1, n + 1))
    step = n / k
    return sorted({int(i * step) + 1 for i in range(k)})


def probe_pdf(pdf: str) -> dict:
    pages = page_count(pdf)
    fonts = parse_pdffonts(_run("pdffonts", pdf))
    picked = sample_pages(pages)
    text = "\f".join(_run("pdftotext", "-f", str(p), "-l", str(p), "-enc", "UTF-8", pdf, "-") for p in picked)
    c = classify(fonts, text, pages=len(picked) or 1)
    return {"pages": pages, "fonts": sorted({f.name for f in fonts}), "probe": "pdf", **asdict(c)}


def probe_drive_text(path: str) -> dict:
    content = json.load(open(path))["fileContent"]
    pages = len(re.findall(r"\*\*Page \d+\*\*", content)) or 1
    text = re.sub(r"\|\s*:?-+:?\s*\||\[\*\*Page \d+\*\*\]\(\)|^-----$|\|", " ", content, flags=re.M)
    text = text.replace("Untitled", "", 1)
    c = classify(None, text, pages=pages)
    return {"pages": pages, "fonts": [], "probe": "drive-text", **asdict(c)}


if __name__ == "__main__":
    if sys.argv[1] == "--drive-text":
        out = probe_drive_text(sys.argv[2])
    else:
        out = probe_pdf(sys.argv[1])
    print(json.dumps(out, ensure_ascii=False))
