#!/usr/bin/env python3
"""Add sweep finds to catalogue.json as candidates, and promote them after review.

  python3 pipeline/catalogue/candidates.py seen URL [URL ...]          # already catalogued?
  python3 pipeline/catalogue/candidates.py add FINDS.json --date D --by sweep-<source>
  python3 pipeline/catalogue/candidates.py promote [--reject ID ...]

FINDS.json: {"works": [...], "versions": [...]}. A version names its works in
"contains" by "work_id", or by "work_title" (+ optional "authors", "gurmukhi") when the
work may be new; titles are matched loosely against every known title and variant.
"date" may be free text ("Sammat 1878", "c. 1800"). Ids are made if missing.

Anything already known is skipped and reported: same item page or file (URLs
normalized), same repository + shelfmark, or a work that was rejected. Rejected rows
stay in the catalogue for exactly this reason. A payload that fails validation is
refused whole and nothing is written.
"""

import copy
import json
import os
import re
import sys
from urllib.parse import urlsplit

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from schema import load, parse_date, save, slug, validate  # noqa: E402
from seed import norm_title, unique_id  # noqa: E402


def norm_url(url):
    if not url:
        return None
    p = urlsplit(url.strip())
    host = p.netloc.lower().removeprefix("www.")
    path = re.sub(r"/+$", "", p.path)
    query = "" if host.endswith("archive.org") else p.query  # archive.org queries are view options
    return f"{host}{path}" + (f"?{query}" if query else "")


def norm_shelf(repository, shelfmark):
    if not (repository and shelfmark):
        return None
    clean = lambda s: re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()  # noqa: E731
    return f"{clean(repository)}|{clean(shelfmark)}"


def version_keys(v: dict) -> list[str]:
    keys = [norm_url(v.get("item_url")), norm_url(v.get("file_url")),
            norm_shelf(v.get("repository"), v.get("shelfmark"))]
    if v.get("drive_id"):
        keys.append("drive:" + v["drive_id"])
    return [k for k in keys if k]


def _index(cat):
    keys = {}
    for v in cat["versions"]:
        for k in version_keys(v):
            keys.setdefault(k, v["id"])
    titles = {}
    for w in cat["works"]:
        for t in [w["title"]["roman"], *w["title"].get("variants", [])]:
            titles.setdefault(norm_title(t), w)
    return keys, titles


def seen(cat: dict, url: str):
    """The id of a version with this item page or file, or None."""
    keys, _ = _index(cat)
    return keys.get(norm_url(url))


def add(cat: dict, finds: dict, found_on: str, found_by: str) -> dict:
    new = copy.deepcopy(cat)
    keys, titles = _index(new)
    taken = {x["id"] for x in new["works"] + new["versions"]}
    report = {"added_works": [], "added_versions": [], "skipped": []}

    def work_for(title, gurmukhi=None, authors=None, notes=None, known_from=None):
        w = titles.get(norm_title(title))
        if w is None:
            w = {"id": unique_id(slug(title, "w"), taken), "title": {"roman": title}, "status": "candidate",
                 "found_on": found_on, "found_by": found_by}
            if gurmukhi:
                w["title"]["gurmukhi"] = gurmukhi
            if authors:
                w["authors"] = [{"name": a} if isinstance(a, str) else a for a in authors]
            if notes:
                w["notes"] = notes
            if known_from:
                w["known_from"] = known_from
            new["works"].append(w)
            titles[norm_title(title)] = w
            report["added_works"].append(w["id"])
        return w

    for w in finds.get("works", []):
        work_for(w["title"], w.get("gurmukhi"), w.get("authors"), w.get("notes"), w.get("known_from"))

    for raw in finds.get("versions", []):
        v = copy.deepcopy(raw)
        dup = next((keys[k] for k in version_keys(v) if k in keys), None)
        if dup:
            report["skipped"].append({"label": v.get("label"), "reason": "already catalogued", "duplicate_of": dup})
            continue
        contains, rejected = [], False
        for c in v.get("contains", []):
            if c.get("work_id"):
                wid = c["work_id"]
                status = next((w["status"] for w in new["works"] if w["id"] == wid), None)
            else:
                w = work_for(c["work_title"], c.get("gurmukhi"), c.get("authors"))
                wid, status = w["id"], w["status"]
            rejected |= status == "rejected"
            contains.append({k: x for k, x in {"work_id": wid, "locator": c.get("locator"),
                                               "note": c.get("note")}.items() if x})
        if rejected:
            report["skipped"].append({"label": v.get("label"), "reason": "work rejected"})
            continue
        v["contains"] = contains
        if isinstance(v.get("date"), str):
            v["date"] = parse_date(v["date"])
        v.update(status="candidate", found_on=found_on, found_by=found_by)
        v["id"] = unique_id(v.get("id") or slug(v.get("label", "untitled"), "v"), taken)
        new["versions"].append(v)
        for k in version_keys(v):
            keys[k] = v["id"]
        report["added_versions"].append(v["id"])

    errors = validate(new)
    if errors:
        raise ValueError("finds refused; nothing written:\n" + "\n".join(errors))
    cat.clear()
    cat.update(new)
    return report


def promote(cat: dict, reject=()) -> dict:
    """Accept every candidate (the PR was merged) except the ids in reject. Rejecting a
    work also rejects its candidate versions."""
    reject = set(reject)
    rep = {"accepted": 0, "rejected": 0, "works_accepted": 0}
    for w in cat["works"]:
        if w["status"] != "candidate":
            continue
        if w["id"] in reject:
            w["status"] = "rejected"
        else:
            w["status"] = "catalogued"
            rep["works_accepted"] += 1
    rejected_works = {w["id"] for w in cat["works"] if w["status"] == "rejected"}
    for v in cat["versions"]:
        if v["status"] != "candidate":
            continue
        if v["id"] in reject or any(c["work_id"] in rejected_works for c in v["contains"]):
            v["status"] = "rejected"
            rep["rejected"] += 1
        else:
            none = v.get("availability") == "none" or v["type"] == "catalogue-record"
            v["status"] = "catalogue-only" if none else "available"
            rep["accepted"] += 1
    return rep


def main(argv):
    cmd, rest = argv[0], argv[1:]
    cat = load()
    if cmd == "seen":
        for url in rest:
            print(f"{url}\t{seen(cat, url) or '-'}")
        return
    if cmd == "add":
        with open(rest[0], encoding="utf-8") as f:
            finds = json.load(f)
        rep = add(cat, finds, rest[rest.index("--date") + 1], rest[rest.index("--by") + 1])
    elif cmd == "promote":
        rep = promote(cat, rest[rest.index("--reject") + 1:] if "--reject" in rest else [])
        errors = validate(cat)
        if errors:
            sys.exit("\n".join(errors))
    else:
        sys.exit(__doc__)
    save(cat)
    print(json.dumps(rep, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main(sys.argv[1:])
