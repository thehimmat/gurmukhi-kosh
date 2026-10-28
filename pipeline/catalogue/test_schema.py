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

from schema import era, parse_date, validate  # noqa: E402

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

    def test_unconverted_bikrami_date_is_an_error(self):
        errs = errors_for(lambda c: c["versions"][1].update(
            date={"text": "Sammat 1884", "from": 1884, "to": 1884, "approx": True}))
        self.assertTrue(any("Bikrami" in e for e in errs), errs)

    def test_curated_ce_reading_of_a_bikrami_date_is_fine(self):
        # Poh 1955 Bk spans Dec 1898/Jan 1899; either CE year is a fair reading.
        errs = errors_for(lambda c: c["versions"][1].update(date={
            "text": "Poh Sammat 1955 (Bikrami) = c. Dec 1898/Jan 1899 CE", "from": 1898, "to": 1898, "approx": True}))
        self.assertEqual(errs, [])

    def test_converted_bikrami_date_is_fine(self):
        errs = errors_for(lambda c: c["versions"][1].update(
            date={"text": "1884 Bk/AD 1827", "from": 1827, "to": 1827, "approx": False}))
        self.assertEqual(errs, [])

    def test_work_bikrami_dates_checked_too(self):
        errs = errors_for(lambda c: c["works"][0].update(date={"text": "1884 Bk", "from": 1884, "to": 1884}))
        self.assertTrue(any("Bikrami" in e for e in errs), errs)

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

    def test_bk_abbreviation(self):
        d = parse_date("1884 Bk")
        self.assertEqual((d["from"], d["to"], d["approx"]), (1827, 1827, True))
        for text in ("Bk 1884", "1884 BS", "VS 1884", "Bikrami 1884", "1884 Bikrami", "Sambat 1884", "S. 1884 Bk."):
            self.assertEqual(parse_date(text)["from"], 1827, text)

    def test_explicit_ad_wins_over_bikrami(self):
        d = parse_date("1884 Bk/AD 1827")
        self.assertEqual((d["from"], d["to"], d["approx"]), (1827, 1827, False))
        self.assertEqual(parse_date("Sammat 1826 (1769 CE)")["from"], 1769)

    def test_circa_with_bikrami_and_ad(self):
        d = parse_date("c. 1919 Bk/AD 1862")
        self.assertEqual((d["from"], d["to"], d["approx"]), (1852, 1872, True))
        d = parse_date("c. 1919 Bk")
        self.assertEqual((d["from"], d["to"], d["approx"]), (1852, 1872, True))

    def test_bikrami_range(self):
        d = parse_date("Sammat 1820–1830")
        self.assertEqual((d["from"], d["to"]), (1763, 1773))

    def test_gurmukhi_numerals_and_words(self):
        self.assertEqual(parse_date("ਸੰਮਤ ੧੮੭੬")["from"], 1819)
        self.assertEqual(parse_date("ਸੰਬਤ ੧੮੭੬ ਬਿਕ੍ਰਮੀ")["from"], 1819)
        self.assertEqual(parse_date("੧੮੭੬ ਈ.")["from"], 1876)

    def test_unmarked_ce_year_beside_a_bikrami_one(self):
        d = parse_date("1894 (Samvat 1951)")
        self.assertEqual((d["from"], d["approx"]), (1894, False))
        self.assertEqual(parse_date("1696 (1753 Bk)")["from"], 1696)

    def test_ce_month_range_beside_bikrami(self):
        self.assertEqual(parse_date("Poh Sammat 1955 (Bikrami) = c. Dec 1898/Jan 1899 CE")["from"], 1899)

    def test_nanakshahi_and_khalsa_samvat_are_not_bikrami(self):
        self.assertEqual(parse_date("1900 (Samvat Nanakshahi 431)")["from"], 1900)
        self.assertEqual(parse_date("Khalsa Samvat 302, Jeth sudi; 5 June 2000 (as printed)")["from"], 2000)

    def test_devanagari_samvat(self):
        self.assertEqual(parse_date("संवत् १८७६")["from"], 1819)

    def test_unparseable_keeps_text_only(self):
        self.assertEqual(parse_date("undated"), {"text": "undated", "approx": True})

    def test_empty(self):
        self.assertIsNone(parse_date(None))
        self.assertIsNone(parse_date(""))


class Era(unittest.TestCase):
    def test_tiers(self):
        self.assertEqual(era({"text": "1780", "from": 1780, "to": 1780}), "pre-1850")
        self.assertEqual(era({"text": "1849", "from": 1849, "to": 1849}), "pre-1850")
        self.assertEqual(era({"text": "1850", "from": 1850, "to": 1850}), "1850-1899")
        self.assertEqual(era({"text": "1903", "from": 1903, "to": 1903}), "1900+")
        self.assertEqual(era({"text": "undated"}), "undated")
        self.assertEqual(era(None), "undated")

    def test_ranges_straddling_a_boundary_use_the_midpoint(self):
        self.assertEqual(era({"text": "c. 1845", "from": 1835, "to": 1855}), "pre-1850")
        self.assertEqual(era({"text": "19th century", "from": 1801, "to": 1900}), "1850-1899")


if __name__ == "__main__":
    unittest.main()
