#!/usr/bin/env python3
"""Which source slice and which wanted works a sweep run covers.

  python3 pipeline/catalogue/sweep_plan.py YYYY-MM-DD

Keyed to the run count (lines in data/sweeps.jsonl), not the date, so the rotation holds
whatever the schedule: run n takes slice n mod 7, and a window of WANTED_PER_RUN works
walks down the wanted list (earliest era first, then neediest).
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from build import by_work, composed_by, holding, wanted  # noqa: E402
from schema import era, load  # noqa: E402

LOG = os.path.join(HERE, "data", "sweeps.jsonl")
WANTED_PER_RUN = 5

SLICES = [
    {"key": "pdl", "name": "Panjab Digital Library",
     "where": ["panjabdigilib.org (manuscripts, lithographs, early prints; search by title and in Gurmukhi)"]},
    {"key": "archive-org", "name": "Internet Archive",
     "where": ["archive.org full-text and metadata search (Gurmukhi and roman titles)",
               "collections: Digital Library of India, PDL uploads, Namdhari eLibrary, eGangotri, Sikh book uploads"]},
    {"key": "uk-europe", "name": "UK and European libraries",
     "where": ["British Library (Explore catalogue, Endangered Archives Programme)", "Wellcome Collection",
               "Bodleian / Cambridge Digital Library / SOAS", "Bayerische Staatsbibliothek (Trumpp collection)"]},
    {"key": "india-institutions", "name": "Indian institutional catalogues",
     "where": ["Punjabi University Patiala", "Guru Nanak Dev University", "Panjab University (incl. eGangotri)",
               "Kurukshetra University", "SGPC Sikh Reference Library", "Khalsa College Amritsar",
               "National Mission for Manuscripts (namami.gov.in)", "Bhasha Vibhag Punjab"]},
    {"key": "digital-libraries", "name": "General digital libraries",
     "where": ["HathiTrust", "Google Books", "indianculture.gov.in", "Rekhta (Perso-Arabic works)",
               "GRETIL / sanskritdocuments (source texts of translations)"]},
    {"key": "sikh-archives", "name": "Sikh community archives",
     "where": ["SikhBookClub", "DiscoverSikhism", "Gurmat Veechar", "bhainandlal.com", "SearchGurbani granths",
               "Sikh Heritage / private manuscript collections that publish scans"]},
    {"key": "catalogue-mining", "name": "Mine reference works for unknown texts",
     "where": ["the catalogue's own reference versions (type reference, e.g. Ashok's manuscript catalogues) "
               "and the Encyclopaedia of Sikhism: list works named there that the catalogue lacks"]},
]


def runs_logged(path: str = LOG) -> int:
    try:
        with open(path, encoding="utf-8") as f:
            return sum(1 for line in f if line.strip())
    except FileNotFoundError:
        return 0


def plan(cat: dict, day: str, run: int) -> dict:
    w = wanted(cat)
    window = [w[(run * WANTED_PER_RUN + i) % len(w)] for i in range(min(WANTED_PER_RUN, len(w)))] if w else []
    vbw = by_work(cat)
    return {
        "date": day,
        "run": run,
        "slice": SLICES[run % len(SLICES)],
        "wanted": [{"id": work["id"], "title": work["title"]["roman"],
                    "authors": [a["name"] for a in work.get("authors", [])],
                    "era": era(composed_by(work, vbw[work["id"]])),
                    "holding": holding(vbw[work["id"]])} for work, _ in window],
    }


if __name__ == "__main__":
    print(json.dumps(plan(load(), sys.argv[1], runs_logged()), ensure_ascii=False, indent=1))
