#!/usr/bin/env python3
"""Tests for matching local copies of Drive files to their Drive ids.

Run from the project root:
  python3 pipeline/scans/inventory/test_probe_local.py
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from probe_local import match_drive_id  # noqa: E402

NODES = {
    "a": {"id": "a", "kind": "P", "size": 1000, "title": "Dasam Granth MS.pdf"},
    "b": {"id": "b", "kind": "P", "size": 2000, "title": "Dasam Granth MS.pdf"},
    "c": {"id": "c", "kind": "P", "size": 3000, "title": "ਹਨੂਮਾਨ ਨਾਟਕ.pdf"},
    "f": {"id": "f", "kind": "F", "size": 0, "title": "Dasam Granth"},
}


class Match(unittest.TestCase):
    def test_same_title_told_apart_by_size(self):
        self.assertEqual(match_drive_id(NODES, "Dasam Granth MS.pdf", 2000), "b")

    def test_unicode_title_in_another_normal_form(self):
        # macOS file names come back decomposed (NFD)
        import unicodedata
        self.assertEqual(match_drive_id(NODES, unicodedata.normalize("NFD", "ਹਨੂਮਾਨ ਨਾਟਕ.pdf"), 3000), "c")

    def test_size_alone_when_the_file_was_renamed(self):
        self.assertEqual(match_drive_id(NODES, "renamed.pdf", 3000), "c")

    def test_no_match(self):
        self.assertIsNone(match_drive_id(NODES, "other.pdf", 999))


if __name__ == "__main__":
    unittest.main()
