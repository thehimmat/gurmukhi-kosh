#!/usr/bin/env python3
"""Tests for reverse_appendix.py: which glossary entries are appendix head-words
and the derived record ingest.ts reads (`_derived`, `_ambiguities`).

Logic tests use a fake transliterator; the last test runs the real
gurmukhi-transliterate so an API change in that library fails here.

Run from the project root:
  python3 pipeline/shackle/test_reverse_appendix.py
"""

import os
import sys
import unittest
from types import SimpleNamespace

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import reverse_appendix  # noqa: E402


def fake_reverse(gurmukhi, ambiguities=()):
    return lambda headword: SimpleNamespace(gurmukhi=gurmukhi, ambiguities=list(ambiguities))


AMB = SimpleNamespace(kind="vowel", chosen="ਿ", alternatives=["ੀ"], note="short i", source="i", start=3)


class DeriveEntry(unittest.TestCase):
    def test_entry_with_printed_gurmukhi_is_not_appendix(self):
        e = {"id": 1, "headword": "nānaku", "gurmukhi": "ਨਾਨਕੁ"}
        self.assertIsNone(reverse_appendix.derive_entry(e, fake_reverse("ਨਾਨਕੁ")))

    def test_whitespace_only_gurmukhi_counts_as_missing(self):
        e = {"id": 1, "headword": "nānaku", "gurmukhi": "  "}
        self.assertIsNotNone(reverse_appendix.derive_entry(e, fake_reverse("ਨਾਨਕੁ")))

    def test_fills_derived_gurmukhi_and_flags(self):
        e = {"id": 7, "headword": "kirati", "gurmukhi": ""}
        out = reverse_appendix.derive_entry(e, fake_reverse("ਕਿਰਤਿ"))
        self.assertEqual(out["gurmukhi"], "ਕਿਰਤਿ")
        self.assertEqual(out["gurmukhiNormalized"], "ਕਿਰਤਿ")
        self.assertIs(out["_derived"], True)
        self.assertEqual(out["_ambiguities"], [])
        self.assertEqual(out["id"], 7)
        self.assertEqual(out["headword"], "kirati")

    def test_ambiguities_become_plain_dicts(self):
        e = {"id": 7, "headword": "kirati"}
        out = reverse_appendix.derive_entry(e, fake_reverse("ਕਿਰਤਿ", [AMB]))
        self.assertEqual(out["_ambiguities"], [
            {"kind": "vowel", "chosen": "ਿ", "alternatives": ["ੀ"], "note": "short i", "source": "i", "start": 3},
        ])

    def test_does_not_mutate_the_input(self):
        e = {"id": 7, "headword": "kirati", "gurmukhi": ""}
        reverse_appendix.derive_entry(e, fake_reverse("ਕਿਰਤਿ"))
        self.assertEqual(e, {"id": 7, "headword": "kirati", "gurmukhi": ""})


class RealLibrary(unittest.TestCase):
    def test_default_transliterator_returns_gurmukhi(self):
        out = reverse_appendix.derive_entry({"id": 1, "headword": "nānaku"})
        self.assertEqual(out["gurmukhi"], "ਨਾਨਕੁ")
        self.assertIsInstance(out["_ambiguities"], list)


if __name__ == "__main__":
    unittest.main()
