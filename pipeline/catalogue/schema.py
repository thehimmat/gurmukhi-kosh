#!/usr/bin/env python3
"""The granth catalogue: works, and the versions of them we have or know of.

  python3 pipeline/catalogue/schema.py [catalogue.json]   # validate; exit 1 on errors

A work is a text (Sri Gur Sobha). A version is one physical or digital witness of
one or more works: a manuscript, a print, an edition, an anthology carrying extracts.
Versions join the Drive inventory by drive_id. See README.md for the fields.
"""

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_PATH = os.path.join(HERE, "catalogue.json")

WORK_STATUSES = {
    "catalogued",      # accepted into the catalogue
    "needs-curation",  # seeded from a Drive file; title/grouping not yet checked
    "candidate",       # found by a sweep, awaiting review
    "rejected",        # reviewed and turned down (kept so sweeps don't re-propose it)
}
VERSION_TYPES = {
    "manuscript", "lithograph", "early-print", "edition", "e-text", "translation",
    "commentary", "compilation", "anthology", "study", "catalogue-record",
    "reference",  # catalogues, bibliographies, encyclopaedias: sources for the wanted list
}
HISTORIC_TYPES = {"manuscript", "lithograph", "early-print"}
VERSION_STATUSES = {
    "in-drive",        # a copy is in Drive (drive_id set)
    "available",       # online, not saved
    "catalogue-only",  # known from a catalogue or citation; no scan found
    "candidate",       # found by a sweep, awaiting review
    "rejected",
}
AVAILABILITY = {"free-download", "free-view", "login", "paid", "none"}
SCRIPTS = {"Gurmukhi", "Devanagari", "Perso-Arabic", "Roman", "Sharada", "Takri", "Landa", "Other"}

ID_RE = re.compile(r"^[wv]-[a-z0-9]+(?:-[a-z0-9]+)*$")
URL_FIELDS = ("item_url", "file_url")


def slug(text: str, prefix: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return f"{prefix}-{s[:60].rstrip('-') or 'untitled'}"


# ---------------------------------------------------------------- dates

_YEAR = r"(1[0-9]{3}|20[0-9]{2})"


def parse_date(text):
    """A free-text date → {text, from?, to?, approx}. Years are CE; Bikrami
    (Sammat/Samvat/BS/VS) years are converted (−57, approx since the year
    boundaries differ). Returns None for empty input."""
    if text is None:
        return None
    text = str(text).strip()
    if not text:
        return None
    t = text.lower()

    m = re.search(r"\b(?:sammat|samvat|sambat|bs|vs|bikrami)\.?\s*" + _YEAR, t)
    if m:
        ce = int(m.group(1)) - 57
        return {"text": text, "from": ce, "to": ce, "approx": True}

    m = re.search(r"\b(1[0-9]|20)(?:st|nd|rd|th)\s+c(?:entury|\.)", t)
    if m:
        c = int(m.group(1))
        return {"text": text, "from": (c - 1) * 100 + 1, "to": c * 100, "approx": True}

    m = re.search(_YEAR + r"\s*[-–—]\s*" + _YEAR, t)
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        return {"text": text, "from": min(a, b), "to": max(a, b), "approx": False}

    m = re.search(r"\b(?:c\.|ca\.|circa|about|~)\s*" + _YEAR, t)
    if m:
        y = int(m.group(1))
        return {"text": text, "from": y - 10, "to": y + 10, "approx": True}

    m = re.search(_YEAR, t)
    if m:
        y = int(m.group(1))
        return {"text": text, "from": y, "to": y, "approx": "?" in t}

    return {"text": text, "approx": True}


# ---------------------------------------------------------------- validation

def _check_date(where, date, errs):
    if date is None:
        return
    if not isinstance(date, dict) or "text" not in date:
        errs.append(f"{where}: date must be an object with text")
        return
    lo, hi = date.get("from"), date.get("to")
    if (lo is None) != (hi is None):
        errs.append(f"{where}: date needs both from and to, or neither")
    elif lo is not None and lo > hi:
        errs.append(f"{where}: date from {lo} is after to {hi}")


def validate(cat: dict) -> list[str]:
    errs: list[str] = []
    seen: set[str] = set()

    def check_id(where, obj, prefix):
        i = obj.get("id", "")
        if not ID_RE.match(i or "") or not i.startswith(prefix + "-"):
            errs.append(f"{where}: id {i!r} must be a lowercase slug starting with '{prefix}-'")
        if i in seen:
            errs.append(f"{where}: duplicate id {i}")
        seen.add(i)
        return i

    work_ids = set()
    for n, w in enumerate(cat.get("works", [])):
        where = f"works[{n}]"
        wid = check_id(where, w, "w")
        work_ids.add(wid)
        where = wid or where
        if not (w.get("title") or {}).get("roman"):
            errs.append(f"{where}: title.roman is required")
        if w.get("status") not in WORK_STATUSES:
            errs.append(f"{where}: status {w.get('status')!r} not in {sorted(WORK_STATUSES)}")
        if w.get("status") == "candidate" and not w.get("found_on"):
            errs.append(f"{where}: candidate needs found_on")
        _check_date(where, w.get("date"), errs)

    drive_ids: dict[str, str] = {}
    for n, v in enumerate(cat.get("versions", [])):
        where = check_id(f"versions[{n}]", v, "v") or f"versions[{n}]"
        if not v.get("label"):
            errs.append(f"{where}: label is required")
        if v.get("type") not in VERSION_TYPES:
            errs.append(f"{where}: type {v.get('type')!r} not in {sorted(VERSION_TYPES)}")
        status = v.get("status")
        if status not in VERSION_STATUSES:
            errs.append(f"{where}: status {status!r} not in {sorted(VERSION_STATUSES)}")
        if status == "candidate" and not v.get("found_on"):
            errs.append(f"{where}: candidate needs found_on")
        if v.get("availability") is not None and v["availability"] not in AVAILABILITY:
            errs.append(f"{where}: availability {v['availability']!r} not in {sorted(AVAILABILITY)}")

        contains = v.get("contains") or []
        if not contains:
            errs.append(f"{where}: contains must list at least one work")
        for c in contains:
            if c.get("work_id") not in work_ids:
                errs.append(f"{where}: contains unknown work {c.get('work_id')}")

        for s in v.get("scripts") or []:
            if s not in SCRIPTS:
                errs.append(f"{where}: script {s!r} not in {sorted(SCRIPTS)}")

        did = v.get("drive_id")
        if status == "in-drive" and not did:
            errs.append(f"{where}: in-drive needs drive_id")
        if did and status != "in-drive":
            errs.append(f"{where}: has drive_id but status is {status}")
        if did:
            if did in drive_ids:
                errs.append(f"{where}: duplicate drive_id {did} (also {drive_ids[did]})")
            drive_ids[did] = where

        for f in URL_FIELDS:
            if v.get(f) and not re.match(r"^https?://", v[f]):
                errs.append(f"{where}: {f} must be an http(s) URL")
        p = v.get("pages")
        if p is not None and (not isinstance(p, int) or isinstance(p, bool) or p < 1):
            errs.append(f"{where}: pages must be a positive integer")
        _check_date(where, v.get("date"), errs)
    return errs


def load(path: str = DEFAULT_PATH) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save(cat: dict, path: str = DEFAULT_PATH) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(cat, f, ensure_ascii=False, indent=1)
        f.write("\n")


if __name__ == "__main__":
    errors = validate(load(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PATH))
    for e in errors:
        print(e)
    print(f"{len(errors)} error(s)")
    sys.exit(1 if errors else 0)
