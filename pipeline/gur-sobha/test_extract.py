#!/usr/bin/env python3
"""Tests for the Sri Gur Sobha text-layer extract.

Run from the project root:
  python3 pipeline/gur-sobha/test_extract.py
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from extract import Run, page_lines  # noqa: E402


class PageLines(unittest.TestCase):
    def test_converts_asees_runs_top_to_bottom(self):
        runs = [Run(";[fBe? T[gih", 100, 500, 150), Run("nE fgqEw fXnkT[", 100, 600, 180)]
        self.assertEqual([l.gurmukhi for l in page_lines(runs)], ["ਅਥ ਪ੍ਰਿਥਮ ਧਿਆਉ", "ਸੁਨਿਕੈ ਉਪਜੀ"])

    def test_overprinted_bold_is_kept_once(self):
        # headings are made bold by printing the same text several times, a hair apart
        runs = [Run("nek; pkDh", 200 + d, 700 + d, 260 + d) for d in (0, 0.2, 0.4, 0.2, 0)]
        lines = page_lines(runs)
        self.assertEqual([l.gurmukhi for l in lines], ["ਅਕਾਸ ਬਾਣੀ"])
        self.assertTrue(lines[0].bold)

    def test_a_line_printed_once_is_not_bold(self):
        self.assertFalse(page_lines([Run("nek; pkDh", 100, 700, 160)])[0].bold)

    def test_touching_pieces_share_their_seam_letter(self):
        # the real p. 46 title: the aunkar ([) is reported at the end of one piece and the start of the next
        pieces = [(";qh r[", 185.24, 209.32), ("[W ;'Gk rq", 209.55, 252.84), ("zE fby:s/", 253.07, 296.97)]
        runs = [Run(raw, x0, 504.32, x1) for raw, x0, x1 in pieces]
        self.assertEqual([l.gurmukhi for l in page_lines(runs)], ["ਸ੍ਰੀ ਗੁਰੁ ਸੋਭਾ ਗ੍ਰੰਥ ਲਿਖਯਤੇ"])

    def test_pieces_of_a_bold_line_join_without_the_letter_they_share(self):
        # the bold title breaks into pieces that overlap by a letter: ';qh r[' + "[W ;'Gk rq" + 'zE fby:s/'
        pieces = [(";qh r[", 170.0, 205.0), ("[W ;'Gk rq", 204.5, 260.0), ("zE fby:s/", 260.0, 300.0)]
        runs = [Run(raw, x0 + d, 700 + d, x1 + d) for raw, x0, x1 in pieces for d in (0, 0.3)]
        self.assertEqual([l.gurmukhi for l in page_lines(runs)], ["ਸ੍ਰੀ ਗੁਰੁ ਸੋਭਾ ਗ੍ਰੰਥ ਲਿਖਯਤੇ"])

    def test_the_same_line_twice_down_the_page_is_kept_twice(self):
        # a refrain printed twice is two lines, not overprint
        runs = [Run("nek; pkDh", 100, 700, 160), Run("nek; pkDh", 100, 400, 160)]
        self.assertEqual(len(page_lines(runs)), 2)

    def test_runs_on_one_baseline_are_joined_left_to_right(self):
        # a chhand label and its first line share a baseline
        runs = [Run("J/e ;w?", 180, 500, 220), Run("d'jokL", 60, 500.5, 90)]
        self.assertEqual([l.gurmukhi for l in page_lines(runs)], ["ਦੋਹਰਾ: ਏਕ ਸਮੈ"])


if __name__ == "__main__":
    unittest.main()
