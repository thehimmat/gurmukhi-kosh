#!/usr/bin/env python3
"""Record one file's probe in probes.jsonl (used while walking the Drive).

  record.py PROBES DRIVE_ID pdf SAVED.json       download_file_content result (base64 PDF)
  record.py PROBES DRIVE_ID drive SAVED.json     read_file_content result
  record.py PROBES DRIVE_ID drive-text TEXT.txt  Drive text pasted to a file (small inline results)
  record.py PROBES DRIVE_ID empty PAGES          Drive text held only page markers
  record.py PROBES DRIVE_ID error MESSAGE        the file could not be probed
"""

import base64
import json
import os
import sys
import tempfile
from dataclasses import asdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from classify import classify  # noqa: E402
from probe import probe_drive_text, probe_pdf  # noqa: E402


def main(probes: str, drive_id: str, mode: str, arg: str) -> dict:
    if mode == "pdf":
        data = base64.b64decode(json.load(open(arg))["content"])
        with tempfile.NamedTemporaryFile(suffix=".pdf") as f:
            f.write(data)
            f.flush()
            out = probe_pdf(f.name)
    elif mode == "drive":
        out = probe_drive_text(arg)
    elif mode == "drive-text":
        text = open(arg).read()
        pages = max(text.count("**Page "), 1)
        out = {"pages": pages, "fonts": [], "probe": "drive-text", **asdict(classify(None, text, pages=pages))}
    elif mode == "empty":
        out = {"pages": int(arg), "fonts": [], "probe": "drive-text", **asdict(classify(None, "", pages=int(arg)))}
    elif mode == "error":
        out = {"probe": "error", "error": arg, "text_layer": "unprobed"}
    else:
        raise SystemExit(f"unknown mode {mode}")
    out["drive_id"] = drive_id
    with open(probes, "a") as f:
        f.write(json.dumps(out, ensure_ascii=False) + "\n")
    return out


if __name__ == "__main__":
    r = main(*sys.argv[1:5])
    print(r.get("text_layer"), r.get("encodings", ""), r.get("pages", ""))
