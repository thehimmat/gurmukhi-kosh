#!/usr/bin/env python3
"""Tests for the Bhai Gurdas Singh vaar text-layer extract.

Run from the project root:
  python3 pipeline/gurdas-singh-vaar/test_extract.py
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from extract import Run, convert, page_lines  # noqa: E402


class Convert(unittest.TestCase):
    def test_gurbanilipi_keys_to_unicode(self):
        self.assertEqual(convert("vwh vwh goibMd isMG Awpy guru cylw ] 1 ]"), "ਵਾਹ ਵਾਹ ਗੋਬਿੰਦ ਸਿੰਘ ਆਪੇ ਗੁਰੁ ਚੇਲਾ ॥ ੧ ॥")

    def test_a_lone_less_than_is_ik_onkar(self):
        # GurbaniLipi draws the whole ੴ on '<' (page 1, checked against its image); the converter
        # knows only the two-key '<>' form and turns a lone '<' into 'Å'
        self.assertEqual(convert("< siqgurpRswid ]"), "ੴ ਸਤਿਗੁਰਪ੍ਰਸਾਦਿ ॥")

    def test_the_two_key_form_still_converts(self):
        self.assertEqual(convert("<> siqgurpRswid ]"), "ੴ ਸਤਿਗੁਰਪ੍ਰਸਾਦਿ ॥")


class PageLines(unittest.TestCase):
    def test_lines_top_to_bottom(self):
        runs = [Run("nwnk ]", 56.8, 600, 90), Run("hir ]", 56.8, 700, 80)]
        self.assertEqual([l.gurmukhi for l in page_lines(runs)], ["ਹਰਿ ॥", "ਨਾਨਕ ॥"])

    def test_runs_on_one_baseline_are_one_line(self):
        runs = [Run("] 1 ]", 200, 700.4, 230), Run("cylw", 56.8, 700, 190)]
        self.assertEqual([l.gurmukhi for l in page_lines(runs)], ["ਚੇਲਾ ॥ ੧ ॥"])


if __name__ == "__main__":
    unittest.main()
