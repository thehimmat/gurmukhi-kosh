#!/usr/bin/env python3
"""Render a scan's pages to WebP for the curator's scan viewer (/admin/scans).

    python3 pipeline/scans/text-layer/render-pages.py <pdf> <slug> <outdir> [--pages 9-14] [--dpi 150]

Writes <outdir>/<slug>/NNNN.webp (PDF page numbers, as scan-text-layer uses), skipping pages already
rendered. Then copy <outdir>/<slug> to SCAN_IMAGE_ROOT on the server, e.g.

    rsync -av <outdir>/<slug> ubuntu@141.148.39.45:/opt/kosh/scans/

Needs pdftoppm (poppler) and Pillow. Run it on the Mac, where the PDFs are (Google Drive for
desktop); one page at a time, so a 600 MB manuscript never sits in memory or in /tmp whole.
"""
import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image


def page_count(pdf: Path) -> int:
    out = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True, check=True).stdout
    return int(next(l.split()[-1] for l in out.splitlines() if l.startswith("Pages:")))


def page_range(spec: str | None, last: int) -> range:
    if not spec:
        return range(1, last + 1)
    a, _, b = spec.partition("-")
    return range(int(a), int(b or a) + 1)


def render(pdf: Path, page: int, dpi: int, dest: Path, quality: int) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        stem = Path(tmp) / "p"
        subprocess.run(
            ["pdftoppm", "-f", str(page), "-l", str(page), "-r", str(dpi), "-png", "-singlefile", str(pdf), str(stem)],
            check=True,
        )
        with Image.open(f"{stem}.png") as im:
            im.convert("RGB").save(dest, "WEBP", quality=quality, method=6)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path)
    ap.add_argument("slug")
    ap.add_argument("outdir", type=Path)
    ap.add_argument("--pages")
    ap.add_argument("--dpi", type=int, default=150)
    ap.add_argument("--quality", type=int, default=72)
    args = ap.parse_args()

    out = args.outdir / args.slug
    out.mkdir(parents=True, exist_ok=True)
    pages = page_range(args.pages, page_count(args.pdf))
    for p in pages:
        dest = out / f"{p:04d}.webp"
        if dest.exists():
            continue
        render(args.pdf, p, args.dpi, dest, args.quality)
        print(dest, dest.stat().st_size, flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
