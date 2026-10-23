#!/usr/bin/env python3
"""Probe local copies of Drive PDFs (e.g. the Google Drive for desktop folder).

Drive's text extraction returns nothing for large files and the Drive tools
cannot download over 10 MB, so those files are probed from a synced copy:

  python3 pipeline/scans/inventory/probe_local.py DIR [--only-unprobed]

Each PDF under DIR is matched to its Drive id by title and size (data/tree.json),
probed with probe.py, and appended to data/probes.jsonl. With --only-unprobed,
files whose latest probe already found something other than unindexed/unprobed
are skipped. Then rerun build.py.
"""

import json
import os
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")


def _nfc(s: str) -> str:
    return unicodedata.normalize("NFC", s)


def match_drive_id(nodes: dict, filename: str, size: int) -> str | None:
    """The Drive id of a local file: same title and size, else a unique size."""
    pdfs = [n for n in nodes.values() if n["kind"] == "P"]
    for n in pdfs:
        if _nfc(n["title"]) == _nfc(filename) and n["size"] == size:
            return n["id"]
    same_size = [n for n in pdfs if n["size"] == size]
    return same_size[0]["id"] if len(same_size) == 1 else None


def main(root: str, only_unprobed: bool) -> None:
    from probe import probe_pdf

    nodes = json.load(open(os.path.join(DATA, "tree.json")))["nodes"]
    probes_path = os.path.join(DATA, "probes.jsonl")
    latest = {}
    for line in open(probes_path):
        if line.strip():
            p = json.loads(line)
            latest[p["drive_id"]] = p["text_layer"]
    for dirpath, _, files in os.walk(root):
        for name in sorted(files):
            if not name.lower().endswith(".pdf"):
                continue
            path = os.path.join(dirpath, name)
            drive_id = match_drive_id(nodes, name, os.path.getsize(path))
            if not drive_id:
                print(f"no Drive match: {path}")
                continue
            if only_unprobed and latest.get(drive_id) not in (None, "unindexed", "unprobed"):
                continue
            out = probe_pdf(path)
            out["drive_id"] = drive_id
            with open(probes_path, "a") as f:
                f.write(json.dumps(out, ensure_ascii=False) + "\n")
            print(f"{out['text_layer']:10} {','.join(out['encodings']):12} {name}")


if __name__ == "__main__":
    main(sys.argv[1], "--only-unprobed" in sys.argv)
