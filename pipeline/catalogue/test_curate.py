#!/usr/bin/env python3
"""Tests for curation operations on the catalogue.

Run from the project root:
  python3 pipeline/catalogue/test_curate.py
"""

import copy
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from curate import apply  # noqa: E402
from schema import validate  # noqa: E402

BASE = {
    "version": 1,
    "works": [
        {"id": "w-panj-sau-sakhi", "title": {"roman": "Panj Sau Sakhi", "variants": ["Sau Sakhi"]},
         "authors": [{"name": "Ram Kuir"}], "status": "catalogued"},
        {"id": "w-sau-sakhi", "title": {"roman": "Sau Sakhi (drive)"}, "authors": [{"name": "Ram Kuir"}],
         "status": "needs-curation"},
        {"id": "w-gurbilas-patshahi-10", "title": {"roman": "Gurbilas Patshahi 10"}, "status": "needs-curation"},
        {"id": "w-lesson-1", "title": {"roman": "Lesson 1"}, "status": "needs-curation"},
    ],
    "versions": [
        {"id": "v-sakhee-book", "label": "The Sakhee Book (1873)", "type": "commentary", "status": "in-drive",
         "drive_id": "D1", "contains": [{"work_id": "w-sau-sakhi"}]},
        {"id": "v-gb-ms", "label": "Gurbilas MS PU 1175 (Sumer Singh)", "type": "manuscript", "status": "in-drive",
         "drive_id": "D2", "contains": [{"work_id": "w-gurbilas-patshahi-10"}]},
        {"id": "v-gb-litho", "label": "Gurbilas lithograph (Sukha Singh)", "type": "lithograph", "status": "in-drive",
         "drive_id": "D3", "contains": [{"work_id": "w-gurbilas-patshahi-10"}]},
        {"id": "v-lesson", "label": "Lesson 1", "type": "edition", "status": "in-drive", "drive_id": "D4",
         "contains": [{"work_id": "w-lesson-1"}]},
    ],
}


def run(ops):
    cat = copy.deepcopy(BASE)
    report = apply(cat, ops)
    return cat, report


def work(cat, wid):
    return next((w for w in cat["works"] if w["id"] == wid), None)


def version(cat, vid):
    return next(v for v in cat["versions"] if v["id"] == vid)


class Merge(unittest.TestCase):
    def test_merge_moves_versions_keeps_titles_and_drops_the_source(self):
        cat, rep = run([{"op": "merge", "from": "w-sau-sakhi", "into": "w-panj-sau-sakhi"}])
        self.assertIsNone(work(cat, "w-sau-sakhi"))
        self.assertEqual(version(cat, "v-sakhee-book")["contains"], [{"work_id": "w-panj-sau-sakhi"}])
        dst = work(cat, "w-panj-sau-sakhi")
        self.assertIn("Sau Sakhi (drive)", dst["title"]["variants"])
        self.assertEqual(dst["authors"], [{"name": "Ram Kuir"}])  # no duplicate author
        self.assertEqual(rep["merged"], 1)
        self.assertEqual(validate(cat), [])

    def test_merge_with_locator(self):
        cat, _ = run([{"op": "merge", "from": "w-sau-sakhi", "into": "w-panj-sau-sakhi", "locator": "sakhis 1-10"}])
        self.assertEqual(version(cat, "v-sakhee-book")["contains"][0]["locator"], "sakhis 1-10")
        # an extract is part of the work, not another name for it
        self.assertNotIn("Sau Sakhi (drive)", work(cat, "w-panj-sau-sakhi")["title"]["variants"])

    def test_merge_into_unknown_work_fails_and_changes_nothing(self):
        cat = copy.deepcopy(BASE)
        with self.assertRaises(ValueError):
            apply(cat, [{"op": "merge", "from": "w-sau-sakhi", "into": "w-nope"}])
        self.assertEqual(cat, BASE)


class Split(unittest.TestCase):
    def test_new_work_then_move_one_version(self):
        cat, _ = run([
            {"op": "new_work", "id": "w-gurbilas-patshahi-10-sumer-singh",
             "title": {"roman": "Gurbilas Patshahi 10 (Sumer Singh)"}, "authors": [{"name": "Sumer Singh"}]},
            {"op": "move_version", "version": "v-gb-ms", "from": "w-gurbilas-patshahi-10",
             "to": "w-gurbilas-patshahi-10-sumer-singh"},
            {"op": "update_work", "id": "w-gurbilas-patshahi-10",
             "title": {"roman": "Gurbilas Patshahi 10 (Sukha Singh)"}, "composed": "1854 Bk/AD 1797",
             "status": "catalogued"},
        ])
        self.assertEqual(validate(cat), [])
        new = work(cat, "w-gurbilas-patshahi-10-sumer-singh")
        self.assertEqual(new["status"], "catalogued")  # new works default to catalogued
        self.assertEqual(version(cat, "v-gb-ms")["contains"], [{"work_id": "w-gurbilas-patshahi-10-sumer-singh"}])
        old = work(cat, "w-gurbilas-patshahi-10")
        self.assertEqual((old["title"]["roman"], old["date"]["from"]), ("Gurbilas Patshahi 10 (Sukha Singh)", 1797))

    def test_add_to_version(self):
        cat, _ = run([{"op": "new_work", "id": "w-hikayat", "title": {"roman": "Hikayat"}},
                      {"op": "add_to_version", "version": "v-gb-litho", "work": "w-hikayat", "locator": "ff. 1-9"}])
        self.assertEqual(version(cat, "v-gb-litho")["contains"][-1], {"work_id": "w-hikayat", "locator": "ff. 1-9"})


class Updates(unittest.TestCase):
    def test_update_work_merges_title_fields_and_replaces_others(self):
        cat, _ = run([{"op": "update_work", "id": "w-sau-sakhi",
                       "title": {"gurmukhi": "ਸੌ ਸਾਖੀ"}, "authors": [{"name": "X"}], "based_on": ["w-panj-sau-sakhi"]}])
        w = work(cat, "w-sau-sakhi")
        self.assertEqual(w["title"], {"roman": "Sau Sakhi (drive)", "gurmukhi": "ਸੌ ਸਾਖੀ"})
        self.assertEqual((w["authors"], w["based_on"]), ([{"name": "X"}], ["w-panj-sau-sakhi"]))

    def test_update_version_parses_dates(self):
        cat, _ = run([{"op": "update_version", "id": "v-sakhee-book", "type": "translation", "date": "1873"}])
        v = version(cat, "v-sakhee-book")
        self.assertEqual((v["type"], v["date"]["from"]), ("translation", 1873))

    def test_unknown_fields_are_refused(self):
        with self.assertRaises(ValueError):
            run([{"op": "update_work", "id": "w-sau-sakhi", "colour": "blue"}])

    def test_reject_keeps_the_file_link_and_records_why(self):
        cat, rep = run([{"op": "reject", "id": "w-lesson-1", "note": "teaching material"}])
        w = work(cat, "w-lesson-1")
        self.assertEqual((w["status"], w["notes"]), ("rejected", "Rejected: teaching material"))
        self.assertEqual(version(cat, "v-lesson")["status"], "in-drive")
        self.assertEqual(rep["rejected"], 1)
        self.assertEqual(validate(cat), [])

    def test_unknown_op(self):
        with self.assertRaises(ValueError):
            run([{"op": "frobnicate"}])

    def test_result_must_validate(self):
        with self.assertRaises(ValueError):
            run([{"op": "update_work", "id": "w-sau-sakhi", "based_on": ["w-ghost"]}])


if __name__ == "__main__":
    unittest.main()
