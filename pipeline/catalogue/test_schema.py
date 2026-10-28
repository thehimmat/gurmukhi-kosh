#!/usr/bin/env python3
"""Tests for the catalogue schema.

Run from the project root:
  python3 pipeline/catalogue/test_schema.py
"""

import copy
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from schema import parse_date, validate  # noqa: E402

GOOD = {
    "version": 1,
    "works": [
        {
            "id": "w-sri-gur-sobha",
            "title": {"roman": "Sri Gur Sobha", "gurmukhi": "ਸ੍ਰੀ ਗੁਰ ਸੋਭਾ", "variants": ["Gur Sobha"]},
            "authors": [{"name": "Sainapati"}],
            "status": "catalogued",
            "known_from": ["Anandpur library — Padam 1976 (Darbari Ratan)"],
        },
        {
            "id": "w-lav-kus-di-var",
            "title": {"roman": "Lav Kus di Var"},
            "status": "catalogued",
        },
    ],
    "versions": [
        {
            "id": "v-padam-punjabi-varan-2008",
            "label": "Padam, Punjabi Varan (Singh Brothers, Amritsar, 2008 ed.)",
            "type": "anthology",
            "contains": [{"work_id": "w-lav-kus-di-var", "locator": "Var Lau Kusu ki"}],
            "scripts": ["Gurmukhi"],
            "languages": ["Panjabi", "Braj/Bhakha"],
            "date": {"text": "2008", "from": 2008, "to": 2008, "approx": False},
            "status": "in-drive",
            "drive_id": "1lvnJw1LdcE0584u8-rg0fv3R_Lm4NS0g",
            "item_url": "https://archive.org/details/PunjabiVaran",
        },
        {
            "id": "v-gur-sobha-ms",
            "label": "Sri Gur Sobha, Gurmukhi MS",
            "type": "manuscript",
            "contains": [{"work_id": "w-sri-gur-sobha"}],
            "date": {"text": "c. 1800", "from": 1790, "to": 1810, "approx": True},
            "pages": 212,
            "status": "available",
            "item_url": "https://archive.org/details/example",
        },
    ],
}


def errors_for(mutate):
    cat = copy.deepcopy(GOOD)
    mutate(cat)
    return validate(cat)


class Valid(unittest.TestCase):
    def test_good_catalogue_has_no_errors(self):
        self.assertEqual(validate(GOOD), [])


class Works(unittest.TestCase):
    def test_ids_are_prefixed_slugs(self):
        errs = errors_for(lambda c: c["works"][0].update(id="Sri Gur Sobha"))
        self.assertTrue(any("id" in e for e in errs), errs)

    def test_duplicate_ids(self):
        errs = errors_for(lambda c: c["works"][1].update(id="w-sri-gur-sobha"))
        self.assertTrue(any("duplicate" in e for e in errs), errs)

    def test_roman_title_required(self):
        errs = errors_for(lambda c: c["works"][0].update(title={"gurmukhi": "ਸੋਭਾ"}))
        self.assertTrue(any("title.roman" in e for e in errs), errs)

    def test_status_enum(self):
        errs = errors_for(lambda c: c["works"][0].update(status="have"))
        self.assertTrue(any("status" in e for e in errs), errs)


class Versions(unittest.TestCase):
    def test_contains_must_reference_known_works(self):
        errs = errors_for(lambda c: c["versions"][0]["contains"].append({"work_id": "w-missing"}))
        self.assertTrue(any("w-missing" in e for e in errs), errs)

    def test_contains_not_empty(self):
        errs = errors_for(lambda c: c["versions"][0].update(contains=[]))
        self.assertTrue(any("contains" in e for e in errs), errs)

    def test_type_enum(self):
        errs = errors_for(lambda c: c["versions"][0].update(type="book"))
        self.assertTrue(any("type" in e for e in errs), errs)

    def test_script_enum(self):
        errs = errors_for(lambda c: c["versions"][0].update(scripts=["Gurmukhī"]))
        self.assertTrue(any("script" in e for e in errs), errs)

    def test_in_drive_needs_drive_id(self):
        errs = errors_for(lambda c: c["versions"][0].pop("drive_id"))
        self.assertTrue(any("drive_id" in e for e in errs), errs)

    def test_drive_id_means_in_drive(self):
        errs = errors_for(lambda c: c["versions"][1].update(drive_id="abc"))
        self.assertTrue(any("drive_id" in e for e in errs), errs)

    def test_drive_id_unique(self):
        def mutate(c):
            c["versions"][1].update(drive_id=c["versions"][0]["drive_id"], status="in-drive")
        errs = errors_for(mutate)
        self.assertTrue(any("duplicate drive_id" in e for e in errs), errs)

    def test_urls_are_http(self):
        errs = errors_for(lambda c: c["versions"][1].update(item_url="archive.org/x"))
        self.assertTrue(any("item_url" in e for e in errs), errs)

    def test_pages_positive_int(self):
        errs = errors_for(lambda c: c["versions"][1].update(pages=0))
        self.assertTrue(any("pages" in e for e in errs), errs)

    def test_date_range_ordered(self):
        errs = errors_for(lambda c: c["versions"][1]["date"].update({"from": 1820, "to": 1800}))
        self.assertTrue(any("date" in e for e in errs), errs)

    def test_candidate_needs_found_on(self):
        errs = errors_for(lambda c: c["versions"][1].update(status="candidate"))
        self.assertTrue(any("found_on" in e for e in errs), errs)


class ParseDate(unittest.TestCase):
    def test_plain_year(self):
        self.assertEqual(parse_date("1886"), {"text": "1886", "from": 1886, "to": 1886, "approx": False})

    def test_reprint_keeps_first_year(self):
        d = parse_date("1968 (repr. 2000)")
        self.assertEqual((d["from"], d["to"], d["approx"]), (1968, 1968, False))
        self.assertEqual(d["text"], "1968 (repr. 2000)")

    def test_circa(self):
        d = parse_date("c. 1700")
        self.assertEqual((d["from"], d["to"], d["approx"]), (1690, 1710, True))

    def test_range(self):
        d = parse_date("1871–1875")
        self.assertEqual((d["from"], d["to"], d["approx"]), (1871, 1875, False))

    def test_century(self):
        d = parse_date("18th century")
        self.assertEqual((d["from"], d["to"], d["approx"]), (1701, 1800, True))

    def test_bikrami_samvat_converted(self):
        d = parse_date("Sammat 1876")  # Bikrami; CE = BS - 57
        self.assertEqual((d["from"], d["to"]), (1819, 1819))
        self.assertTrue(d["approx"])  # BS→CE is ±1 year

    def test_unparseable_keeps_text_only(self):
        self.assertEqual(parse_date("undated"), {"text": "undated", "approx": True})

    def test_empty(self):
        self.assertIsNone(parse_date(None))
        self.assertIsNone(parse_date(""))


if __name__ == "__main__":
    unittest.main()
