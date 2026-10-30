#!/usr/bin/env python3
"""Tests for verify_spellings.py: classifying a printed Gurmukhi head-word as
exact / candidate / divergent against its reverse-transliterated romanization.

Logic tests use a fake transliterator; the last test runs the real
gurmukhi-transliterate so an API change in that library fails here.

Run from the project root:
  python3 pipeline/shackle/test_verify_spellings.py
"""

import os
import sys
import unicodedata
import unittest
from types import SimpleNamespace

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import verify_spellings  # noqa: E402


def fakes(primary, cands=()):
    reverse = lambda headword: SimpleNamespace(gurmukhi=primary)
    candidates = lambda result: [primary, *cands]
    return reverse, candidates


def check(e, primary, cands=()):
    reverse, candidates = fakes(primary, cands)
    return verify_spellings.check_entry(e, reverse, candidates)


class CheckEntry(unittest.TestCase):
    def test_appendix_entry_is_skipped(self):
        self.assertIsNone(check({"id": 1, "headword": "kirati", "gurmukhi": ""}, "ਕਿਰਤਿ"))
        self.assertIsNone(check({"id": 1, "headword": "kirati"}, "ਕਿਰਤਿ"))

    def test_whitespace_only_gurmukhi_is_an_appendix_entry(self):
        # Same rule as reverse_appendix.py and ingest.ts (gurmukhi.trim()): blank is not printed.
        self.assertIsNone(check({"id": 1, "headword": "kirati", "gurmukhi": "  "}, "ਕਿਰਤਿ"))
        self.assertIsNone(check({"id": 1, "headword": "kirati", "gurmukhi": "\n"}, "ਕਿਰਤਿ"))

    def test_exact_has_no_row(self):
        self.assertEqual(check({"id": 1, "headword": "nānaku", "gurmukhi": "ਨਾਨਕੁ"}, "ਨਾਨਕੁ"), ("exact", None))

    def test_candidate_match(self):
        e = {"id": 2, "headword": "kirati", "gurmukhi": "ਕੀਰਤਿ"}
        match, row = check(e, "ਕਿਰਤਿ", ["ਕੀਰਤਿ"])
        self.assertEqual(match, "candidate")
        self.assertEqual(row, {
            "id": 2, "gurmukhi": "ਕੀਰਤਿ", "headword": "kirati",
            "suggested": "ਕਿਰਤਿ", "candidates": ["ਕਿਰਤਿ", "ਕੀਰਤਿ"], "match": "candidate",
        })

    def test_divergent_suggests_the_primary_form(self):
        e = {"id": 3, "headword": "kirati", "gurmukhi": "ਕਰਿਤ"}
        match, row = check(e, "ਕਿਰਤਿ", ["ਕੀਰਤਿ"])
        self.assertEqual(match, "divergent")
        self.assertEqual(row["suggested"], "ਕਿਰਤਿ")

    def test_compares_after_nfc_normalisation(self):
        # OCR can emit precomposed ਖ਼ (U+0A59); NFC turns it into ਖ + nukta (a composition
        # exclusion), which is what the transliterator outputs. They must compare equal.
        precomposed = "ਖ਼ੁਦਾ"
        decomposed = "ਖ਼ੁਦਾ"
        self.assertEqual(unicodedata.normalize("NFC", precomposed), decomposed)
        match, _ = check({"id": 4, "headword": "xudā", "gurmukhi": precomposed}, decomposed)
        self.assertEqual(match, "exact")


class RealLibrary(unittest.TestCase):
    def test_default_transliterator_classifies(self):
        self.assertEqual(verify_spellings.check_entry({"id": 1, "headword": "nānaku", "gurmukhi": "ਨਾਨਕੁ"}), ("exact", None))


if __name__ == "__main__":
    unittest.main()
