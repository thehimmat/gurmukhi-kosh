#!/usr/bin/env python3
"""Write the catalogue views from catalogue.json:

  python3 pipeline/catalogue/build.py [--xlsx OUT.xlsx]

- CATALOGUE.md beside this file: counts, the wanted list, needs-curation, all works.
- views/works.csv, versions.csv, wanted.csv: the full tables (GitHub renders them searchable).
- With --xlsx, the same as a workbook (not committed), e.g. to open in Google Sheets.

"Holding" is computed per work from its versions, never stored, so it can't drift:
  historic     a manuscript, lithograph or early print is in Drive
  edition      a modern edition, translation, commentary or compilation is in Drive
  extracts     only an anthology, study or reference work carrying it is in Drive
  online-only  nothing in Drive, but a copy is available online
  known-only   known from a catalogue or citation; no copy found
  nothing      no version recorded yet
Every catalogued work short of "historic" is on the wanted list (a work composed after 1947:
short of "edition"); the sweep looks for historic copies, and any copy at all of the neediest.
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from schema import HISTORIC_TYPES, load  # noqa: E402

EDITION_TYPES = {"edition", "e-text", "translation", "commentary", "compilation"}
LEVELS = ["nothing", "known-only", "online-only", "extracts", "edition", "historic"]
LIVE = {"in-drive", "available", "catalogue-only"}


def holding(versions: list[dict]) -> str:
    vs = [v for v in versions if v.get("status") in LIVE]
    drive = {v["type"] for v in vs if v["status"] == "in-drive"}
    if drive & HISTORIC_TYPES:
        return "historic"
    if drive & EDITION_TYPES:
        return "edition"
    if drive:
        return "extracts"
    if any(v["status"] == "available" for v in vs):
        return "online-only"
    if vs:
        return "known-only"
    return "nothing"


def by_work(cat: dict) -> dict:
    out: dict[str, list] = {w["id"]: [] for w in cat["works"]}
    for v in cat["versions"]:
        for c in v["contains"]:
            out.setdefault(c["work_id"], []).append(v)
    return out


def _year(v):
    return (v.get("date") or {}).get("from")


def best_lead(versions: list[dict]):
    """The best not-yet-saved copy: historic before modern, earliest first."""
    avail = [v for v in versions if v.get("status") == "available"]
    avail.sort(key=lambda v: (v["type"] not in HISTORIC_TYPES, _year(v) or 9999))
    return avail[0] if avail else None


MODERN_FROM = 1947  # works composed after this have no "historic" copy to find


def wanted(cat: dict):
    """[(work, best lead or None)] for catalogued works short of a historic copy (for a
    modern work, short of an edition), neediest first. Needs-curation works wait for curation."""
    vbw = by_work(cat)
    out = []
    for i, w in enumerate(cat["works"]):
        if w["status"] != "catalogued":
            continue
        h = holding(vbw[w["id"]])
        modern = ((w.get("date") or {}).get("from") or 0) >= MODERN_FROM
        if LEVELS.index(h) < LEVELS.index("edition" if modern else "historic"):
            out.append((LEVELS.index(h), i, w, best_lead(vbw[w["id"]])))
    out.sort(key=lambda t: (t[0], t[1]))
    return [(w, lead) for _, _, w, lead in out]


def _authors(w):
    return "; ".join(a["name"] for a in w.get("authors", []))


def _drive(v):
    return f"https://drive.google.com/file/d/{v['drive_id']}/view" if v.get("drive_id") else ""


def work_rows(cat: dict) -> list[dict]:
    vbw = by_work(cat)
    rows = []
    for w in cat["works"]:
        vs = vbw[w["id"]]
        years = [y for y in map(_year, vs) if y]
        rows.append({
            "ID": w["id"], "Title": w["title"]["roman"], "Gurmukhi": w["title"].get("gurmukhi", ""),
            "Other titles": "; ".join(w["title"].get("variants", [])), "Authors": _authors(w),
            "Date": (w.get("date") or {}).get("text", ""), "Status": w["status"],
            "Holding": holding(vs), "Versions": len(vs),
            "In Drive": sum(v["status"] == "in-drive" for v in vs),
            "Earliest dated version": min(years) if years else "",
            "Known from": "; ".join(w.get("known_from", [])), "Notes": w.get("notes", ""),
        })
    return rows


def version_rows(cat: dict) -> list[dict]:
    titles = {w["id"]: w["title"]["roman"] for w in cat["works"]}
    rows = []
    for v in cat["versions"]:
        d = v.get("date") or {}
        rows.append({
            "ID": v["id"], "Works": "; ".join(titles[c["work_id"]] for c in v["contains"]),
            "Version": v["label"], "Type": v["type"], "Status": v["status"],
            "Script": ", ".join(v.get("scripts", [])), "Language": ", ".join(v.get("languages", [])),
            "Date": d.get("text", ""), "Year from": d.get("from", ""), "Year to": d.get("to", ""),
            "Approx.": "yes" if d.get("approx") else "",
            "Editor / scribe": v.get("contributors", ""), "Publisher": v.get("publisher", ""),
            "Pages": v.get("pages", ""), "Repository": v.get("repository", ""),
            "Shelfmark": v.get("shelfmark", ""), "Host": v.get("host", ""),
            "Availability": v.get("availability", ""), "Item page": v.get("item_url", ""),
            "Direct file": v.get("file_url", ""), "Drive": _drive(v),
            "Drive folder": v.get("drive_folder", ""), "Text layer": v.get("text_layer", ""),
            "Found": v.get("found_on", ""), "Found by": v.get("found_by", ""),
            "Notes": " | ".join(c["note"] for c in v["contains"] if c.get("note")),
            "My notes": v.get("user_notes", ""),
        })
    return rows


def _md_cell(x) -> str:
    return str(x if x is not None else "").replace("|", "\\|").replace("\n", " ")


def _md_table(headers, rows) -> list[str]:
    out = ["| " + " | ".join(headers) + " |", "|" + "---|" * len(headers)]
    out += ["| " + " | ".join(_md_cell(r.get(h, "")) for h in headers) + " |" for r in rows]
    return out


def render_markdown(cat: dict) -> str:
    rows = work_rows(cat)
    counts = {lvl: sum(r["Holding"] == lvl for r in rows) for lvl in reversed(LEVELS)}
    lines = [
        "# Granth catalogue",
        "",
        "Generated from `catalogue.json` by `build.py`; don't edit by hand. See README.md.",
        "",
        f"{len(cat['works'])} works, {len(cat['versions'])} versions "
        f"({sum(v['status'] == 'in-drive' for v in cat['versions'])} in Drive).",
        "",
        "Holding: " + ", ".join(f"{n} {lvl}" for lvl, n in counts.items()) + ".",
        "",
        "## Wanted",
        "",
        "Works with no historic copy (manuscript, lithograph or early print) in Drive, neediest first.",
        "",
    ]
    wrows = []
    for w, lead in wanted(cat):
        r = next(x for x in rows if x["ID"] == w["id"])
        wrows.append({"Work": r["Title"], "Authors": r["Authors"], "Holding": r["Holding"],
                      "Best lead": f"[{lead['label']}]({lead.get('file_url') or lead.get('item_url')})"
                      if lead and (lead.get("file_url") or lead.get("item_url")) else ""})
    lines += _md_table(["Work", "Authors", "Holding", "Best lead"], wrows)
    lines += ["", "## Needs curation", "",
              "Seeded from Drive file names; check the title, merge duplicates, then set status to catalogued.", ""]
    lines += _md_table(["ID", "Title", "Versions"], [r for r in rows if r["Status"] == "needs-curation"])
    lines += ["", "## All works", ""]
    lines += _md_table(["Title", "Authors", "Holding", "Versions", "In Drive", "Earliest dated version"],
                       sorted(rows, key=lambda r: r["Title"].lower()))
    return "\n".join(lines) + "\n"


README_SHEET = [
    "Granth catalogue — generated view. Don't edit here: changes go in catalogue.json",
    "(github.com/thehimmat/gurmukhi-kosh, pipeline/catalogue/), and this sheet is regenerated.",
    "",
    "Works — one row per text, with its holding level.",
    "Versions — one row per manuscript, print, edition, anthology etc., with script, language, date, pages, links.",
    "Wanted — works with no historic copy in Drive, neediest first, with the best online lead.",
    "Needs curation — works seeded from Drive file names that still need a proper title or merging.",
    "",
    "Holding: historic > edition > extracts > online-only > known-only > nothing.",
]


def wanted_rows(cat: dict) -> list[dict]:
    by_id = {r["ID"]: r for r in work_rows(cat)}
    return [{**{k: by_id[w["id"]][k] for k in ("ID", "Title", "Authors", "Holding", "Known from")},
             "Best lead": lead["label"] if lead else "",
             "Lead link": (lead.get("file_url") or lead.get("item_url") or "") if lead else ""}
            for w, lead in wanted(cat)]


def write_csvs(cat: dict, out_dir: str) -> None:
    """works.csv, versions.csv, wanted.csv: GitHub shows these as searchable tables."""
    import csv
    os.makedirs(out_dir, exist_ok=True)
    for name, rows in (("works", work_rows(cat)), ("versions", version_rows(cat)), ("wanted", wanted_rows(cat))):
        with open(os.path.join(out_dir, f"{name}.csv"), "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0]) if rows else ["ID"])
            w.writeheader()
            w.writerows(rows)


def write_xlsx(cat: dict, path: str) -> None:
    import openpyxl
    from openpyxl.styles import Font

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Read me"
    for line in README_SHEET:
        ws.append([line])

    def tab(name, rows, headers=None):
        sh = wb.create_sheet(name)
        headers = headers or (list(rows[0]) if rows else ["ID"])
        sh.append(headers)
        for c in sh[1]:
            c.font = Font(bold=True)
        for r in rows:
            sh.append([r.get(h, "") for h in headers])
        for col in sh.iter_cols(min_row=2):
            for c in col:
                if isinstance(c.value, str) and c.value.startswith("http"):
                    c.hyperlink = c.value
        sh.freeze_panes = "B2"
        sh.auto_filter.ref = sh.dimensions

    wrows = work_rows(cat)
    tab("Works", wrows)
    tab("Versions", version_rows(cat))
    tab("Wanted", wanted_rows(cat), ["ID", "Title", "Authors", "Holding", "Known from", "Best lead", "Lead link"])
    tab("Needs curation", [r for r in wrows if r["Status"] == "needs-curation"],
        ["ID", "Title", "Gurmukhi", "Authors", "Versions", "In Drive"])
    wb.save(path)


def main(argv):
    cat = load()
    with open(os.path.join(HERE, "CATALOGUE.md"), "w", encoding="utf-8") as f:
        f.write(render_markdown(cat))
    write_csvs(cat, os.path.join(HERE, "views"))
    if "--xlsx" in argv:
        write_xlsx(cat, argv[argv.index("--xlsx") + 1])
    print("wrote CATALOGUE.md, views/*.csv" + (" and the workbook" if "--xlsx" in argv else ""))


if __name__ == "__main__":
    main(sys.argv[1:])
