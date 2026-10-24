#!/usr/bin/env python3
"""Tests for the Chandi Charitar II text-layer extract.

Run from the project root:
  python3 pipeline/chandi-charitar-2/test_extract.py
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from extract import Run, convert, page_lines, role  # noqa: E402

VERSE, LABEL, TRANSLATION = "CFHCOA+MSTT31c5cb", "CFHCOA+MSTT31c629", "MSTT31c5d6"


class Convert(unittest.TestCase):
    def test_reads_the_joy_like_font_through_its_standard_encoding_names(self):
        # pdfminer names bytes 0x60, 0x27, 0xE8, 0xA4 by StandardEncoding: ‘ ’ Ł ⁄ (page 1, line 1)
        self.assertEqual(convert("wfjy dJhs ;{o:‘. pfY:’ ;’ b’j g{o:‘."), "ਮਹਿਖ ਦਈਤ ਸੂਰਯੰ। ਬਢਿਯੋ ਸੋ ਲੋਹ ਪੂਰਯੰ।")
        self.assertEqual(convert("nE uzvh ufosq fby⁄:sŁ."), "ਅਥ ਚੰਡੀ ਚਰਿਤ੍ਰ ਲਿਖ੍ਯਤੇ।")


class Role(unittest.TestCase):
    def test_keeps_the_verse_and_label_fonts_of_the_left_page(self):
        self.assertEqual(role(VERSE, 9.5, 101), "text")
        self.assertEqual(role(VERSE, 11.0, 145), "text")  # ਅਥ … ਕਥਨੰ, the work's own headings
        self.assertEqual(role(VERSE, 9.5, 354), "text")  # the end of a long rasaval line (page 1)
        self.assertEqual(role(LABEL, 9.0, 179), "label")
        self.assertEqual(role("CFHCOA+MSTT31c634", 8.0, 36), "label")

    def test_drops_the_translation_the_running_head_and_the_right_page(self):
        self.assertIsNone(role(TRANSLATION, 9.5, 101))  # translation, footnotes, page numbers
        self.assertIsNone(role(VERSE, 14.0, 156))  # ਚੰਡੀ ਚਰਿਤ੍ਰ-੨ on page 1
        self.assertIsNone(role(VERSE, 9.5, 432))  # the facing page


class PageLines(unittest.TestCase):
    def test_lines_run_top_to_bottom(self):
        runs = [Run(";[ dŁt oki ihs:z.", 101, 407, 200, "text"), Run("wfjy dJhs ;{o:‘.", 101, 422, 200, "text")]
        self.assertEqual([l.gurmukhi for l in page_lines(runs)], ["ਮਹਿਖ ਦਈਤ ਸੂਰਯੰ।", "ਸੁ ਦੇਵ ਰਾਜ ਜੀਤਯੰ।"])

    def test_pieces_that_touch_are_one_word(self):
        # page 26: pdfminer breaks ਸਤ੍ਰੂਹੰਤੀ (so printed; BaniDB ਸਤ੍ਰੁ) after its first letters; the halves touch
        runs = [Run(";[Gk ;[nkwDh f;q;Nik ;s{", 122.4, 434.1, 230.8, "text"), Run("qjzsh. 31. 250.", 231.0, 434.1, 302.1, "text")]
        self.assertEqual(page_lines(runs)[0].gurmukhi, "ਸੁਭਾ ਸੁਆਮਣੀ ਸ੍ਰਿਸਟਜਾ ਸਤ੍ਰੂਹੰਤੀ। 31। 250।")

    def test_a_piece_set_a_little_low_is_the_rest_of_its_line(self):
        # page 13: the line breaks after ਦ੍ਰ and goes on 3 points lower with its aunkar
        runs = [Run("fisŁeŁ o{g Xkojh. fsfsU dq", 79, 515.5, 200, "text"), Run("[rk ;zxkojh. 42. 119.", 200, 512.6, 280, "text")]
        self.assertEqual([l.gurmukhi for l in page_lines(runs)], ["ਜਿਤੇਕੇ ਰੂਪ ਧਾਰਹੀ। ਤਿਤਿਓ ਦ੍ਰੁਗਾ ਸੰਘਾਰਹੀ। 42। 119।"])

    def test_pieces_apart_are_two_words(self):
        runs = [Run("uozB", 101, 285, 120, "text"), Run("g{ipŁ", 125, 285, 140, "text")]
        self.assertEqual(page_lines(runs)[0].gurmukhi, "ਚਰੰਨ ਪੂਜਬੇ")

    def test_a_line_takes_its_role_from_its_first_run(self):
        runs = [Run("Boki Szd", 179, 440, 210, "label")]
        self.assertEqual(page_lines(runs)[0].role, "label")


if __name__ == "__main__":
    unittest.main()
