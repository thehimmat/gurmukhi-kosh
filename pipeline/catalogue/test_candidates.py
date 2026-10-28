#!/usr/bin/env python3
"""Tests for adding sweep finds to the catalogue and promoting them after review.

Run from the project root:
  python3 pipeline/catalogue/test_candidates.py
"""

import copy
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from candidates import add, promote, seen  # noqa: E402
from schema import validate  # noqa: E402

BASE = {
    "version": 1,
    "works": [
        {"id": "w-sri-gur-sobha", "title": {"roman": "Sri Gur Sobha", "variants": ["Gur Sobha"]},
         "status": "catalogued"},
        {"id": "w-old-reject", "title": {"roman": "Old Reject"}, "status": "rejected"},
    ],
    "versions": [
        {"id": "v-gs-ed", "label": "Gur Sobha, ed. Ganda Singh", "type": "edition", "status": "available",
         "contains": [{"work_id": "w-sri-gur-sobha"}], "item_url": "https://archive.org/details/gs",
         "file_url": "https://archive.org/download/gs/gs.pdf"},
        {"id": "v-rejected-ms", "label": "Some MS", "type": "manuscript", "status": "rejected",
         "contains": [{"work_id": "w-old-reject"}], "repository": "British Library", "shelfmark": "MS Panj. E 1"},
    ],
}
DATE, BY = "2026-10-28", "sweep-pdl"


def fresh():
    return copy.deepcopy(BASE)


class Add(unittest.TestCase):
    def test_new_version_of_known_work_by_title(self):
        cat = fresh()
        rep = add(cat, {"versions": [{"label": "Gur Sobha, Gurmukhi MS, PDL M-1234", "type": "manuscript",
                                      "contains": [{"work_title": "Gur Sobha"}],
                                      "item_url": "https://www.panjabdigilib.org/x?ID=1234",
                                      "date": "Sammat 1878", "pages": 140, "scripts": ["Gurmukhi"]}]},
                  DATE, BY)
        self.assertEqual(validate(cat), [])
        v = cat["versions"][-1]
        self.assertEqual((v["status"], v["found_on"], v["found_by"]), ("candidate", DATE, BY))
        self.assertEqual(v["contains"], [{"work_id": "w-sri-gur-sobha"}])
        self.assertEqual(v["date"]["from"], 1821)
        self.assertEqual(rep["added_versions"], [v["id"]])
        self.assertEqual(rep["added_works"], [])

    def test_unknown_work_becomes_candidate_work(self):
        cat = fresh()
        rep = add(cat, {"versions": [{"label": "Bhagat Ratnavali MS", "type": "manuscript",
                                      "contains": [{"work_title": "Bhagat Ratnavali", "authors": ["Bhai Mani Singh"]}],
                                      "item_url": "https://example.org/br"}]}, DATE, BY)
        self.assertEqual(validate(cat), [])
        w = cat["works"][-1]
        self.assertEqual((w["title"]["roman"], w["status"], w["found_on"]), ("Bhagat Ratnavali", "candidate", DATE))
        self.assertEqual(w["authors"], [{"name": "Bhai Mani Singh"}])
        self.assertEqual(rep["added_works"], [w["id"]])

    def test_duplicates_by_url_shelfmark_or_rejected_are_skipped(self):
        cat = fresh()
        rep = add(cat, {"versions": [
            {"label": "dup file", "type": "edition", "contains": [{"work_id": "w-sri-gur-sobha"}],
             "file_url": "https://archive.org/download/gs/gs.pdf"},
            {"label": "dup page, other slash", "type": "edition", "contains": [{"work_id": "w-sri-gur-sobha"}],
             "item_url": "http://archive.org/details/gs/"},
            {"label": "rejected before", "type": "manuscript", "contains": [{"work_id": "w-sri-gur-sobha"}],
             "repository": "british library", "shelfmark": "MS Panj.  E 1"},
        ]}, DATE, BY)
        self.assertEqual(len(cat["versions"]), 2)
        self.assertEqual([s["duplicate_of"] for s in rep["skipped"]], ["v-gs-ed", "v-gs-ed", "v-rejected-ms"])

    def test_duplicates_within_one_batch(self):
        cat = fresh()
        item = {"label": "x", "type": "edition", "contains": [{"work_id": "w-sri-gur-sobha"}],
                "item_url": "https://e.org/new"}
        rep = add(cat, {"versions": [item, dict(item, label="y")]}, DATE, BY)
        self.assertEqual(len(rep["added_versions"]), 1)

    def test_rejected_work_title_is_not_reproposed(self):
        cat = fresh()
        rep = add(cat, {"versions": [{"label": "Old reject print", "type": "edition",
                                      "contains": [{"work_title": "Old Reject"}], "item_url": "https://e.org/or"}]},
                  DATE, BY)
        self.assertEqual(rep["added_versions"], [])
        self.assertEqual(rep["skipped"][0]["reason"], "work rejected")

    def test_invalid_payload_is_refused_whole(self):
        cat = fresh()
        with self.assertRaises(ValueError):
            add(cat, {"versions": [{"label": "bad", "type": "book", "contains": [{"work_id": "w-sri-gur-sobha"}],
                                    "item_url": "https://e.org/b"}]}, DATE, BY)
        self.assertEqual(cat, BASE)


class Seen(unittest.TestCase):
    def test_seen_normalizes_urls(self):
        self.assertEqual(seen(BASE, "https://archive.org/details/gs?tab=about"), "v-gs-ed")
        self.assertIsNone(seen(BASE, "https://archive.org/details/other"))


class Promote(unittest.TestCase):
    def setUp(self):
        self.cat = fresh()
        add(self.cat, {"versions": [
            {"label": "A MS", "type": "manuscript", "contains": [{"work_title": "New Work"}],
             "item_url": "https://e.org/a", "availability": "free-view"},
            {"label": "B cat", "type": "catalogue-record", "contains": [{"work_title": "New Work"}],
             "repository": "PU", "shelfmark": "MS 9"},
            {"label": "C", "type": "edition", "contains": [{"work_id": "w-sri-gur-sobha"}],
             "item_url": "https://e.org/c"},
        ]}, DATE, BY)

    def test_promote_accepts_all_but_rejected(self):
        ids = {v["label"]: v["id"] for v in self.cat["versions"]}
        rep = promote(self.cat, reject=[ids["C"]])
        st = {v["label"]: v["status"] for v in self.cat["versions"]}
        self.assertEqual((st["A MS"], st["B cat"], st["C"]), ("available", "catalogue-only", "rejected"))
        self.assertEqual(next(w for w in self.cat["works"] if w["title"]["roman"] == "New Work")["status"], "catalogued")
        self.assertEqual(rep, {"accepted": 2, "rejected": 1, "works_accepted": 1})
        self.assertEqual(validate(self.cat), [])

    def test_rejecting_a_work_rejects_its_candidate_versions(self):
        wid = next(w["id"] for w in self.cat["works"] if w["title"]["roman"] == "New Work")
        promote(self.cat, reject=[wid])
        st = {v["label"]: v["status"] for v in self.cat["versions"]}
        self.assertEqual((st["A MS"], st["B cat"], st["C"]), ("rejected", "rejected", "available"))


if __name__ == "__main__":
    unittest.main()
