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

JAPJI_UNICODE = "ਆਦਿ ਸਚੁ ਜੁਗਾਦਿ ਸਚੁ ॥ ਹੈ ਭੀ ਸਚੁ ਨਾਨਕ ਹੋਸੀ ਭੀ ਸਚੁ ॥੧॥\n" * 10
JAPJI_AKHAR = "Awid scu jugwid scu ]\nhY BI scu nwnk hosI BI scu ]1]\n" * 5
ENGLISH = "The Guru's word is the light of the world and all who read it.\n" * 5


def numbered(line: str, n: int) -> str:
    """n distinct copies of a line, as real pages would have (repeats look like stamps)."""
    return "".join(f"{line.rstrip()} {i}\n" for i in range(n))


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
        c = classify(None, numbered(ENGLISH.splitlines()[0], 200) + "".join(numbered(l, 5) for l in asees.splitlines()), pages=10)
        self.assertEqual(c.text_layer, "legacy")
        self.assertEqual(c.encodings[0], "asees")

    def test_english_headings_in_capitals_are_not_legacy(self):
        # 'TRANSLATED BY' is valid AnmolLipi keystrokes; real legacy text mixes cases
        heads = "LELAND STANFORD\nTRANSLATED BY\nBERNARD QUARITCH\nPERSIAN BALUCHISTAN\nTHE GOSHAWKS\nCONTENTS\n"
        c = classify(None, numbered(ENGLISH.splitlines()[0], 100) + "".join(numbered(h, 3) for h in heads.splitlines()), pages=10)
        self.assertEqual(c.text_layer, "latin")

    def test_short_ocr_scraps_are_not_legacy(self):
        # OCR of an old English print (Ganguli's Mahabharata): running heads come out as
        # 'VUl CONTENTS,' or 'ji COlifTENm', which read as AnmolLipi
        scraps = "ji COlifTENm\nVI corrENis.\nVUl CONTENTS,\nCONTENm X4\nBHiRATA PRESS.\nCALCUTTA i\n"
        text = numbered(ENGLISH.splitlines()[0], 300) + "".join(numbered(s, 3) for s in scraps.splitlines())
        self.assertEqual(classify(None, text, pages=10).text_layer, "latin")

    def test_latin_ocr_of_an_indic_page_is_garbled_not_legacy(self):
        # OCR of Devanagari or Gurmukhi pages read as Latin passes AnmolLipi's spelling
        # rules, but converted it makes no words
        junk = ("HirrwfT ^nrrini sr^f^r^nr in. n q^rq^inirrfirfin iTniTn j\n"
                "Tra^3 tfl g?§ goigg 3»W35ftM bSBuS tfl\n"
                "318 33 3'foT 8tP8l 8T33 §3» §4 83T 33T 513\n"
                "eHT^r T^ri^ i ^'^sirr-E^nfr^Rir i ^nrr\n")
        c = classify(None, "".join(numbered(l, 20) for l in junk.splitlines()), pages=10)
        self.assertEqual(c.text_layer, "garbled")
        self.assertEqual(c.encodings, [])

    def test_scanner_watermarks_are_not_a_text_layer(self):
        stamps = ("CC-0. Panjab University Library, Chandigarh. Digitized by eGangotri\n"
                  "Scanned with CamScanner\n"
                  "Digitized by Google\n")
        c = classify(None, "\f".join([stamps] * 30), pages=30)
        self.assertEqual(c.text_layer, "none")

    def test_library_notices_are_not_a_text_layer(self):
        notice = ("Sri Satguru Jagjit Singh Ji eLibrary NamdhariElibrary@gmail.com\n"
                  "This book is part of the collection held by the Bodleian Libraries and scanned by Google, Inc.\n"
                  "For more information see: http://www.bodleian.ox.ac.uk/dbooks\n")
        c = classify(None, notice, pages=1)
        self.assertEqual(c.text_layer, "none")

    def test_a_title_page_alone_in_a_long_scan_is_none(self):
        title = "Prabodhacandrodayanāṭaka : prasiddha nāṭaka Saṃskr̥ta jisameṃ mahābibeka aura mahāmoha\n"
        c = classify(None, title * 3, pages=135)
        self.assertEqual(c.text_layer, "none")

    def test_a_stamp_repeated_on_every_page_is_ignored(self):
        stamp = "Dharmartha Trust J&K Collection, Jammu. Shri Raghunath Temple Library\n"
        c = classify(None, "\f".join([stamp] * 40), pages=40)
        self.assertEqual(c.text_layer, "none")

    def test_english(self):
        c = classify([Font("TimesNewRomanPSMT", uni=True)], ENGLISH, pages=1)
        self.assertEqual(c.text_layer, "latin")

    def test_unicode_with_legacy_fonts_too_is_mixed(self):
        fonts = [Font("Raavi", uni=True), Font("Asees", uni=False)]
        c = classify(fonts, JAPJI_UNICODE + JAPJI_AKHAR, pages=2)
        self.assertEqual(c.text_layer, "mixed")
        self.assertIn("asees", c.encodings)

    def test_glyph_ids_without_a_character_map_are_not_text(self):
        # embedded fonts with no ToUnicode extract as (cid:N): only OCR can read them
        cids = "".join(f"(cid:{i % 40})" for i in range(3000))
        c = classify([Font("TTE1D1A540t00")], cids, pages=5)
        self.assertEqual(c.text_layer, "none")
        self.assertTrue(c.unmapped_glyphs)

    def test_glyph_ids_on_printable_keys_are_not_text(self):
        # a printer driver's embedded TrueType (TTE…t00) with no character map:
        # pdftotext gives the glyph ids as punctuation and stray letters, no words
        soup = "".join(f"{'!.$\"#5468&/*)\'%,'[i % 15]}{'' if i % 4 else chr(65 + i % 26)}\n" for i in range(3000))
        c = classify([Font("ECIJGB+TTE1D1A540t00")], soup, pages=5)
        self.assertEqual(c.text_layer, "none")
        self.assertTrue(c.unmapped_glyphs)

    def test_unknown_gurmukhi_font_is_reported(self):
        fonts = [Font("DrChatrikWeb", uni=False)]
        c = classify(fonts, "kuC Swbd ijs dw nwm nhIN ]\n" * 5, pages=1)
        self.assertIn("DrChatrikWeb", c.unknown_fonts)

    def test_common_latin_fonts_are_not_unknown(self):
        fonts = [Font("ABCDEF+Calibri", uni=True), Font("Arial-BoldMT", uni=True)]
        c = classify(fonts, ENGLISH, pages=1)
        self.assertEqual(c.unknown_fonts, [])


class Unindexed(unittest.TestCase):
    def test_drive_text_with_no_page_markers_is_unindexed(self):
        # Drive returns nothing at all, not even page markers, for files it hasn't indexed
        from probe import classify_drive_content
        self.assertEqual(classify_drive_content("")["text_layer"], "unindexed")

    def test_drive_text_with_empty_pages_is_none(self):
        from probe import classify_drive_content
        content = "Untitled \n\n|  |\n| :-: |\n| [**Page 1**]() |\n\n-----\n\n|  |\n| :-: |\n| [**Page 2**]() |"
        r = classify_drive_content(content)
        self.assertEqual((r["text_layer"], r["pages"]), ("none", 2))


    def test_page_markup_is_not_counted_as_text(self):
        from probe import classify_drive_content
        content = "".join(f"|  |\n| :-: |\n| [**Page {i}**]() |\n\n-----\n\n" for i in range(1, 60))
        self.assertEqual(classify_drive_content(content)["text_layer"], "none")


class Garbled(unittest.TestCase):
    def test_vowel_signs_without_consonants_mark_bad_ocr(self):
        bad = "ਿੀ ਾੁ ਂੇ ਕਿਿ ੋੋ ਾਾ ਿਕ ੀੀ ੁੁ ਂਂ ਰ\n" * 10
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
