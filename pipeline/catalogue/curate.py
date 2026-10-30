#!/usr/bin/env python3
"""Apply a list of curation operations to catalogue.json, all or nothing.

  python3 pipeline/catalogue/curate.py OPS.json

OPS.json is a list of {"op": ..., ...}:
  merge           from, into, [locator]  move every version of `from` to `into` and drop
                                         `from`; its titles become variants, unless a locator
                                         marks it as an extract
  new_work        id, title, [authors, composed, based_on, notes, known_from, status]
  update_work     id, [title (fields merged), authors, composed, based_on, notes, status, known_from]
  move_version    version, from, to      repoint one version from one work to another
  add_to_version  version, work, [locator, note]
  update_version  id, [type, date, label, pages, contributors, publisher, repository,
                       shelfmark, languages, scripts, availability, user_notes]
  reject          id, note               the work leaves the lists; its files stay linked

"composed" is the work's composition date and "date" a version's copy date, both free
text (Bikrami fine; see schema.parse_date). The result must validate or nothing is saved.
"""

import copy
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from schema import load, parse_date, save, validate  # noqa: E402

WORK_FIELDS = {"title", "authors", "composed", "based_on", "notes", "status", "known_from"}
VERSION_FIELDS = {"type", "date", "label", "pages", "contributors", "publisher", "repository", "shelfmark",
                  "languages", "scripts", "availability", "user_notes"}


def _work(cat, wid):
    w = next((x for x in cat["works"] if x["id"] == wid), None)
    if w is None:
        raise ValueError(f"unknown work {wid}")
    return w


def _version(cat, vid):
    v = next((x for x in cat["versions"] if x["id"] == vid), None)
    if v is None:
        raise ValueError(f"unknown version {vid}")
    return v


def _set_work_fields(w, op):
    extra = set(op) - WORK_FIELDS - {"op", "id"}
    if extra:
        raise ValueError(f"{w['id']}: unknown work fields {sorted(extra)}")
    for k, val in op.items():
        if k in ("op", "id"):
            continue
        if k == "title":
            w["title"] = {**w.get("title", {}), **val}
        elif k == "composed":
            w["date"] = parse_date(val)
        else:
            w[k] = val


def apply(cat: dict, ops: list[dict]) -> dict:
    new = copy.deepcopy(cat)
    rep = {"merged": 0, "new_works": 0, "updated_works": 0, "moved": 0, "updated_versions": 0, "rejected": 0}
    for op in ops:
        kind = op.get("op")
        if kind == "merge":
            src, dst = _work(new, op["from"]), _work(new, op["into"])
            for v in new["versions"]:
                entries = [c for c in v["contains"] if c["work_id"] == src["id"]]
                if not entries:
                    continue
                has_dst = any(c["work_id"] == dst["id"] for c in v["contains"])
                kept = []
                for c in v["contains"]:
                    if c["work_id"] != src["id"]:
                        kept.append(c)
                    elif not has_dst:
                        c = {**c, "work_id": dst["id"]}
                        if op.get("locator"):
                            c["locator"] = op["locator"]
                        kept.append(c)
                        has_dst = True
                v["contains"] = kept
            if not op.get("locator"):  # a locator means an extract: not another name for dst
                titles = dst["title"].setdefault("variants", [])
                for t in [src["title"]["roman"], *src["title"].get("variants", [])]:
                    if t != dst["title"]["roman"] and t not in titles:
                        titles.append(t)
                if src["title"].get("gurmukhi") and not dst["title"].get("gurmukhi"):
                    dst["title"]["gurmukhi"] = src["title"]["gurmukhi"]
            names = {a["name"] for a in dst.get("authors", [])}
            for a in src.get("authors", []):
                if a["name"] not in names:
                    dst.setdefault("authors", []).append(a)
            for w in new["works"]:
                if src["id"] in w.get("based_on", []):
                    w["based_on"] = [dst["id"] if b == src["id"] else b for b in w["based_on"]]
            new["works"].remove(src)
            rep["merged"] += 1
        elif kind == "new_work":
            if any(w["id"] == op["id"] for w in new["works"]):
                raise ValueError(f"work {op['id']} exists")
            w = {"id": op["id"], "title": {}, "status": "catalogued"}
            _set_work_fields(w, {k: v for k, v in op.items() if k not in ("op", "id")})
            new["works"].append(w)
            rep["new_works"] += 1
        elif kind == "update_work":
            _set_work_fields(_work(new, op["id"]), op)
            rep["updated_works"] += 1
        elif kind == "move_version":
            v = _version(new, op["version"])
            _work(new, op["to"])
            hit = [c for c in v["contains"] if c["work_id"] == op["from"]]
            if not hit:
                raise ValueError(f"{v['id']} does not contain {op['from']}")
            for c in hit:
                c["work_id"] = op["to"]
            rep["moved"] += 1
        elif kind == "add_to_version":
            v = _version(new, op["version"])
            _work(new, op["work"])
            if all(c["work_id"] != op["work"] for c in v["contains"]):
                v["contains"].append({k: x for k, x in {"work_id": op["work"], "locator": op.get("locator"),
                                                        "note": op.get("note")}.items() if x})
        elif kind == "update_version":
            v = _version(new, op["id"])
            extra = set(op) - VERSION_FIELDS - {"op", "id"}
            if extra:
                raise ValueError(f"{v['id']}: unknown version fields {sorted(extra)}")
            for k, val in op.items():
                if k not in ("op", "id"):
                    v[k] = parse_date(val) if k == "date" and isinstance(val, str) else val
            rep["updated_versions"] += 1
        elif kind == "reject":
            w = _work(new, op["id"])
            w["status"] = "rejected"
            w["notes"] = f"Rejected: {op['note']}"
            rep["rejected"] += 1
        else:
            raise ValueError(f"unknown op {kind!r}")
    errors = validate(new)
    if errors:
        raise ValueError("curation refused; nothing changed:\n" + "\n".join(errors))
    cat.clear()
    cat.update(new)
    return rep


if __name__ == "__main__":
    with open(sys.argv[1], encoding="utf-8") as f:
        ops = json.load(f)
    c = load()
    print(json.dumps(apply(c, ops), indent=1))
    save(c)
