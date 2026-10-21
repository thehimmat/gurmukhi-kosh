#!/usr/bin/env python3
"""Tests for the Drive inventory's text-layer classifier.

Needs the gurmukhi-transliterate library (`pip install
git+https://github.com/thehimmat/gurmukhi-transliterate`).

Run from the project root:
  python3 pipeline/scans/inventory/test_classify.py
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from classify import Font, classify, parse_pdffonts  # noqa: E402

JAPJI_UNICODE = "ਆਦਿ ਸਚੁ ਜੁਗਾਦਿ ਸਚੁ ॥ ਹੈ ਭੀ ਸਚੁ ਨਾਨਕ ਹੋਸੀ ਭੀ ਸਚੁ ॥੧॥\n" * 5
JAPJI_AKHAR = "Awid scu jugwid scu ]\nhY BI scu nwnk hosI BI scu ]1]\n" * 5
ENGLISH = "The Guru's word is the light of the world and all who read it.\n" * 5


class TextLayer(unittest.TestCase):
    def test_no_text_is_none(self):
        c = classify(None, "\n\n  \f\f", pages=3)
        self.assertEqual(c.text_layer, "none")

    def test_a_few_stray_characters_per_page_is_still_none(self):
        # page numbers or a scanner's stamp, not a text layer
        c = classify(None, "1\f2\f3\f4\f5\f", pages=5)
        self.assertEqual(c.text_layer, "none")

    def test_unicode_gurmukhi(self):
        c = classify(None, JAPJI_UNICODE, pages=1)
        self.assertEqual(c.text_layer, "unicode")
        self.assertGreater(c.scripts["gurmukhi"], 0.9)

    def test_gurmukhi_beside_a_longer_translation_is_unicode(self):
        # a bani sheet: each line in Gurmukhi, then transliteration and English
        sheet = ("ਆਦਿ ਸਚੁ ਜੁਗਾਦਿ ਸਚੁ ॥\nAad sach jugaad sach. True in the beginning, "
                 "true through the ages, true here and now.\n") * 8
        c = classify(None, sheet, pages=1)
        self.assertEqual(c.text_layer, "unicode")

    def test_legacy_font_named_by_pdffonts(self):
        fonts = [Font("ABCDEF+GurbaniAkharThick", uni=False)]
        c = classify(fonts, JAPJI_AKHAR, pages=1)
        self.assertEqual(c.text_layer, "legacy")
        self.assertEqual(c.encodings, ["anmollipi"])

    def test_legacy_detected_from_text_when_fonts_unknown(self):
        # files over the download limit are probed by text alone
        c = classify(None, JAPJI_AKHAR, pages=1)
        self.assertEqual(c.text_layer, "legacy")
        self.assertEqual(c.encodings, ["anmollipi"])

    def test_legacy_verse_inside_a_long_english_translation(self):
        # Sri Gur Sobha (Asees) with Kulwant Singh's translation: most lines are English
        asees = ("b? poSh eo w? sp jh, wB' d/y e[ozr e' f;zx i' Xk:'.\n"
                 "ykb;/ e/ f;yB eh fBzde[ i' fBzd eo?,\n")
        c = classify(None, ENGLISH * 40 + asees * 5, pages=10)
        self.assertEqual(c.text_layer, "legacy")
        self.assertEqual(c.encodings[0], "asees")

    def test_english(self):
        c = classify([Font("TimesNewRomanPSMT", uni=True)], ENGLISH, pages=1)
        self.assertEqual(c.text_layer, "latin")

    def test_unicode_with_legacy_fonts_too_is_mixed(self):
        fonts = [Font("Raavi", uni=True), Font("Asees", uni=False)]
        c = classify(fonts, JAPJI_UNICODE + JAPJI_AKHAR, pages=2)
        self.assertEqual(c.text_layer, "mixed")
        self.assertIn("asees", c.encodings)

    def test_unknown_gurmukhi_font_is_reported(self):
        fonts = [Font("DrChatrikWeb", uni=False)]
        c = classify(fonts, "kuC Swbd ijs dw nwm nhIN ]\n" * 5, pages=1)
        self.assertIn("DrChatrikWeb", c.unknown_fonts)

    def test_common_latin_fonts_are_not_unknown(self):
        fonts = [Font("ABCDEF+Calibri", uni=True), Font("Arial-BoldMT", uni=True)]
        c = classify(fonts, ENGLISH, pages=1)
        self.assertEqual(c.unknown_fonts, [])


class Garbled(unittest.TestCase):
    def test_vowel_signs_without_consonants_mark_bad_ocr(self):
        bad = "ਿੀ ਾੁ ਂੇ ਕਿਿ ੋੋ ਾਾ ਿਕ ੀੀ ੁੁ ਂਂ ਰ\n" * 5
        c = classify(None, bad, pages=1)
        self.assertEqual(c.text_layer, "garbled")

    def test_clean_text_is_not_garbled(self):
        self.assertEqual(classify(None, JAPJI_UNICODE, pages=1).text_layer, "unicode")


class Scripts(unittest.TestCase):
    def test_devanagari_and_perso_arabic_are_counted(self):
        c = classify(None, "ज़फ़रनामा ظفرنامه ਜ਼ਫ਼ਰਨਾਮਾ\n" * 5, pages=1)
        self.assertGreater(c.scripts["devanagari"], 0.2)
        self.assertGreater(c.scripts["arabic"], 0.2)
        self.assertGreater(c.scripts["gurmukhi"], 0.2)


class PdfFonts(unittest.TestCase):
    def test_parses_pdffonts_table(self):
        out = (
            "name                                 type              encoding         emb sub uni object ID\n"
            "------------------------------------ ----------------- ---------------- --- --- --- ---------\n"
            "SXBTCX+GurmukhiSangamMN              TrueType          MacRoman         yes yes no       9  0\n"
            "URBPJW+GurmukhiSangamMN              TrueType          WinAnsi          yes yes yes     10  0\n"
            "[none]                               Type 3            Custom           yes no  no      12  0\n"
        )
        fonts = parse_pdffonts(out)
        self.assertEqual([f.name for f in fonts], ["SXBTCX+GurmukhiSangamMN", "URBPJW+GurmukhiSangamMN", "[none]"])
        self.assertEqual([f.uni for f in fonts], [False, True, False])


if __name__ == "__main__":
    unittest.main()
