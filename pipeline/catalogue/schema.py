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

_YEAR = r"(?<!\d)(1[0-9]{3}|20[0-9]{2})(?!\d)"  # exactly four digits: a fifth is OCR noise
BIKRAMI_OFFSET = 57  # CE = Bikrami (Vikram Samvat) − 57; −56 for dates late in the CE year

# Gurmukhi and Devanagari digits read as ASCII.
_DIGITS = str.maketrans("੦੧੨੩੪੫੬੭੮੯०१२३४५६७८९", "01234567890123456789")
# Markers that say a year is Bikrami. Some come before the year (Sammat 1884), some after
# (1884 Bk); a word like "Samvat" after a year belongs to the next year, not that one.
_BK_BEFORE = (r"(?:sammat|samvat|sambat|bikrami|bikram|vikrami|vikram|bk|bs|vs|v\.s|b\.s"
              r"|ਸ[ੰੌੇਂ]*ਮਤਿ?|ਸੰਬਤ|ਬਿਕ੍ਰਮੀ|ਬਿਕਰਮੀ|संवत्?|सम्वत्?|विक्रमी)\.?")  # ਸੰਮਤ and its OCR slips
# After the year: also the Gurmukhi abbreviation ਬਿ: / ਬਿ. ("੧੮੩੫ ਬਿ:").
_BK_AFTER = r"(?:bikrami|vikrami|bk|bs|vs|v\.s|b\.s|ਬਿਕ੍ਰਮੀ|ਬਿਕਰਮੀ|ਬਿ(?=[:.\s]|$)|विक्रमी)\.?:?"
_CENTURY = r"(?<!\d)(1[0-9]|20)\s*(?:st|nd|rd|th|ਵੀਂ|ਵੀ)['’`]?\s*(?:century|c\.|ਸਦੀ)"
_CE = r"(?:ad|a\.d\.|ce|c\.e\.|ਈ\.?|ईस्वी|ई\.)"
_NOT_BK = r"(?:nanakshahi|nanak\s*shahi|khalsa|ਨਾਨਕਸ਼ਾਹੀ|ਖ਼ਾਲਸਾ|ਖਾਲਸਾ)"


def _norm(text) -> str:
    return str(text).translate(_DIGITS).lower()


def bikrami_years(text) -> list[int]:
    """Four-digit years written next to a Bikrami marker ('Sammat 1884', '1884 Bk',
    'Samvat 1950 Bikrami'). A Nanakshahi or Khalsa Samvat year is not one."""
    t = _norm(text)
    years = []
    for m in re.finditer(rf"(?<![a-z]){_BK_BEFORE}[\s:.(]{{0,4}}{_YEAR}|{_YEAR}[\s:.(]{{0,4}}{_BK_AFTER}(?![a-z])", t):
        start = m.start()
        if re.search(rf"{_NOT_BK}\W{{0,3}}$", t[max(0, start - 15):start]):
            continue
        years.append(int(m.group(1) or m.group(2)))
    return years


def is_bikrami(text) -> bool:
    return bool(text and bikrami_years(text))


def _ce_years(t: str) -> list[int]:
    """Years explicitly marked CE/AD in the text."""
    return [int(m.group(1) or m.group(2)) for m in
            re.finditer(rf"(?<![a-z]){_CE}\s*{_YEAR}|{_YEAR}\s*{_CE}(?![a-z])", t)]


_HIJRI = re.compile(rf"{_YEAR}\s*(?:ਹਿਜਰੀ|ਹਿ\.|hijri|a\.?h\.?)(?![a-z])")


def hijri_to_ce(year: int) -> tuple[int, int]:
    """The CE years a Hijri (AH) year falls across: a lunar year straddles two."""
    start = int(year * 0.970229 + 621.5643)
    return start, start + 1


def parse_date(text):
    """A free-text date → {text, from?, to?, approx}, years in CE.

    Bikrami years (Sammat/Samvat/Bk/BS/VS, ਸੰਮਤ, संवत्) are converted (−57) and marked
    approx, since the two calendars' years don't start together (Hijri years, ਹਿਜਰੀ/ਹਿ./AH,
    are converted too, as the two CE years they straddle), unless the text also
    gives the CE year, which then wins: marked ("1884 Bk/AD 1827") or a bare year that
    matches the conversion ("1894 (Samvat 1951)"). Nanakshahi and Khalsa Samvat years are
    left alone. Gurmukhi and Devanagari numerals are read. Returns None for empty input."""
    if text is None:
        return None
    text = str(text).strip()
    if not text:
        return None
    t = _norm(text)
    hj = _HIJRI.search(t)
    if hj:  # Hijri: a CE year given alongside wins, else convert
        marked = _ce_years(t)
        if marked:
            ce = marked[-1]
            return {"text": text, "from": ce, "to": ce, "approx": False}
        lo, hi = hijri_to_ce(int(hj.group(1)))
        return {"text": text, "from": lo, "to": hi, "approx": True}
    bk = bikrami_years(t)
    circa = bool(re.search(r"(?<![a-z])(?:c\.|ca\.|circa|about|~)\s*\d", t))

    def result(lo, hi, approx):
        if circa and lo == hi:
            lo, hi, approx = lo - 10, hi + 10, True
        return {"text": text, "from": lo, "to": hi, "approx": approx}

    if bk:
        marked = _ce_years(t)
        if marked:  # "Dec 1898/Jan 1899 CE": the last-named year
            return result(marked[-1], marked[-1], False)
        bare = [int(y) for y in re.findall(_YEAR, t) if int(y) not in bk]
        matching = [y for y in bare if any(abs(b - BIKRAMI_OFFSET - y) <= 1 for b in bk)]
        if matching:
            return result(matching[0], matching[0], False)

    shift = BIKRAMI_OFFSET if bk else 0
    m = re.search(_YEAR + r"\s*[-–—]\s*" + _YEAR, t)
    if m:
        a, b = int(m.group(1)) - shift, int(m.group(2)) - shift
        return result(min(a, b), max(a, b), bool(bk))

    m = re.search(_CENTURY, t)
    if m and not bk:
        c = int(m.group(1))
        cshift = BIKRAMI_OFFSET if re.match(rf"\s*{_BK_AFTER}", t[m.end():]) else 0  # "੧੯ਵੀਂ ਸਦੀ ਬਿ:"
        return {"text": text, "from": (c - 1) * 100 + 1 - cshift, "to": c * 100 - cshift, "approx": True}

    y = bk[0] if bk else (int(m.group(1)) if (m := re.search(_YEAR, t)) else None)
    if y is not None:
        return result(y - shift, y - shift, bool(bk) or "?" in t)

    return {"text": text, "approx": True}


ERAS = ["pre-1850", "1850-1899", "1900+", "undated"]


def era(date) -> str:
    """Which interest tier a date falls in: pre-1850 (prime), 1850-1899 (strong), 1900+.
    A range is placed by its midpoint."""
    if not date or date.get("from") is None:
        return "undated"
    mid = (date["from"] + date["to"]) / 2
    return "pre-1850" if mid < 1850 else "1850-1899" if mid < 1900 else "1900+"


# ---------------------------------------------------------------- validation

def _check_date(where, date, errs):
    if date is None:
        return
    if not isinstance(date, dict) or "text" not in date:
        errs.append(f"{where}: date must be an object with text")
        return
    lo, hi = date.get("from"), date.get("to")
    hj = _HIJRI.search(_norm(date["text"]))
    if hj and int(hj.group(1)) in {lo, hi} and not _ce_years(_norm(date["text"])):
        errs.append(f"{where}: date {date['text']!r} is Hijri; from/to look unconverted "
                    f"(CE {hijri_to_ce(int(hj.group(1)))[0]}, not {lo})")
    raw = set(bikrami_years(date["text"])) - set(_ce_years(_norm(date["text"])))
    if raw & {lo, hi}:
        expect = parse_date(date["text"])
        errs.append(f"{where}: date {date['text']!r} is Bikrami; from/to look unconverted. CE is "
                    f"{expect.get('from')}–{expect.get('to')} (Bikrami − 57), not {lo}–{hi}")
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

    for w in cat.get("works", []):  # second pass: based_on may point forward
        for b in w.get("based_on") or []:
            if b == w.get("id"):
                errs.append(f"{w.get('id')}: based_on names the work itself")
            elif b not in work_ids:
                errs.append(f"{w.get('id')}: based_on names unknown work {b}")

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
