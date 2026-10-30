#!/usr/bin/env python3
"""Tests for reading entries out of the OCR text of Shamsher Singh Ashok's manuscript
catalogues.

Run from the project root:
  python3 pipeline/catalogue/test_ashok.py
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ashok import CATALOGUES, fix_title, holder, match_key, parse_entries, roman, split_dates, to_finds  # noqa: E402

# Shaped like the OCR output: page furniture, a footnote, OCR slips (ਲੋਖਕ, ਸ਼ੰੌਮਤ, ਨੰ;).
PAGES = {
    10: """ਰਾਮ-ਸਾਹਿੱਤ

੧੯. ਰਾਮਾਇਣ ਭਾਖਾ ਨੰ: ੫੨੮੯

ਲੇਖਕ-- ਸਾਧੂ ਸ਼੍ਰੀ ਨਿਵਾਸ, ਉਦਾਸੀ ! ਆਕਾਰ-12'>82 ', ਲਿਖਤ 92265" ।
ਵੇਰਵਾ--ਪਤ੍ਰ ੧੯੦; ਪ੍ਰਤੀ ਸਫ਼ਾ ੧੮ ਸਤਰਾਂ; ਕਾਗ਼ਜ਼ ਕਸ਼ਮੀਰੀ; ਲਿਖਤ ਸਾਫ਼
ਸਮਾਂ--ਰਚਨਾ ਕਾਲ : ਸ਼ੰੌਮਤ ੧੮੩੫ ਬਿ:, ਨਕਲ : ਸੇਮਤ ੧੮੯੭ ਬਿ. ।
ਸਥਾਨ-ਗੁਰੂ ਦੀ ਕਾਸ਼ੀ (ਦਮਦਮਾ ਸਾਹਿਬ), ਜ਼ਿਲਾ ਬਠਿੰਡਾ (ਪੰਜਾਬ) ।
ਲਿਖਾਰੀ--ਨਾ ਮਾਲੂਮ ।
ਆਰੰਭ--੧ਓ ਸਤਿਗੁਰ ਪ੍ਰਸਾਦਿ । (ਪਤ੍ਰਾ ੧)

੧. ਮੁਗ਼ਲ ਬਾਦਸ਼ਾਹ ਫ਼ਰੁਖ਼ਸੀਅਰ ਦੇ ਸਮੇਂ ।
--੩੦--
""",
    11: """੨੦. (ਉ) ਗੋਸ਼ਟਿ ਸਿੱਧਾਂ ਕੀ ਨੰ; ੬੪੪੩
ਵੇਰਵਾ--ਪਤ੍ਰ ੨੫੯; ਕਾਗ਼ਜ਼ ਦੇਸੀ
ਸਮਾਂ-- ੧੯ਵੀਂ ਸਦੀ ਬਿ: । ਲਿਖਾਰੀ-- ਭਾਈ ਅਤਰ ਸਿੰਘ ।
(ਉ) ਗੋਸ਼ਟਿ ਸਿੱਧਾਂ ਕੀ (ਲੋਖਕ-ਨਾ ਮਾਲੂਮ)
ਆਰੰਭ--੧ ਓ ਸਤਿਗੁਰ ਪ੍ਰਸਾਦਿ ।
(ਅ) ਗੋਸ਼ਟਿ ਅਜਿੱਤੇ ਰੰਧਾਵੇ ਦੀ (ਲੇਖਕ- ਭਾਈ ਮਨੀ ਸਿੰਘ)
੨੧. ਗੀਤਾ ਕਾ ਅਠਾਰ੍ਹਵਾਂ ਧਿਆਇ (ਕਥਾ ਸਤਿਜੁਗ ਕੀ ਆਦਿ ਸਮੇਤ)
ਨੰ: ੧੧੧੧
ਸਮਾਂ--ਸੰਮਤ ੧੯੩੯੮ ਬਿ: ।
੨੨. ਭਾਗਵਤ ਇਕਾਦਸ਼ ਸਕਧ ਭਾਖਾ (ਗਿਆਨ ਮੰਜਰੀ ਆਦਿ ਸਮੇਤ)
ਨ: ੭੮੨
ਲੇਖਕ--ਕਵਿ ਚਤੁਰ ਦਾਸ (ਸੰਮਤ ੧੬੯੨ ੪:) ।
ਅਨੁਵਾਦਕ--ਕਵੀ ਨਾਨਕ ਦਾਸ ।
ਸਮਾਂ--ਸੋਮਤ ੧੮੨੨ ਕਿ । ਲਿਖਾਰੀ--ਨਾਮਾਲੂਮ ।
੨੩. ਸ਼੍ਰੀ ਮਦ ਭਾਗਵਤ ਪੁਰਾਣ ਭਾਖਾ

ਠੰ: ੩੯੭੨
ਸਮਾਂ--੧੮ਵੀਂ ਸਦੀ ਬਿਕ੍ਰਮੀ ।
੨੪. ਗੁਰ ਬਿਲਾਸ ਪਾਤਸ਼ਾਹੀ ੬ (ਅਧੂਰਾ) ਨੰ ੧੮੧੦
ਸਮਾਂ--੧੯ ਵੀ. ਸਦੀ ਬਿ. । ਲਿਖਾਗੀ-ਨਾਮਾਲੂਮ
੨੫. ਮਾਝਾਂ ਕਵੀਆਂ ਦੀਆਂ ਨੌ: ੧੫੬੨
੨੬. ਕਿੱਸਾ ਬਦਰਿ ਮੁਨੀਰ ਗੁ. ਰਾ. ਦਾ. ਲਾ.
ਲੇਖਕ--ਕਵਿ ਸੁੰਦਰ ।
ਸਮਾਂ--੮੦ ਕੁ ਸਾਲ ਦੀ ਪੁਰਾਣੀ ਲਿਖਤ ਹੈ ।
""",
}


class Entries(unittest.TestCase):
    def setUp(self):
        self.entries = parse_entries(PAGES)
        self.by_no = {e["no"]: e for e in self.entries}

    def test_finds_entries_not_footnotes(self):
        self.assertEqual(sorted(self.by_no), [19, 20, 21, 22, 23, 24, 25, 26])

    def test_fields(self):
        e = self.by_no[19]
        self.assertEqual(e["title"], "ਰਾਮਾਇਣ ਭਾਖਾ")
        self.assertEqual(e["ms_no"], "5289")
        self.assertEqual(e["author"], "ਸਾਧੂ ਸ਼੍ਰੀ ਨਿਵਾਸ, ਉਦਾਸੀ")
        self.assertEqual(e["folios"], 190)
        self.assertEqual(e["place"], "ਗੁਰੂ ਦੀ ਕਾਸ਼ੀ (ਦਮਦਮਾ ਸਾਹਿਬ), ਜ਼ਿਲਾ ਬਠਿੰਡਾ (ਪੰਜਾਬ)")
        self.assertIsNone(e["scribe"])  # ਨਾ ਮਾਲੂਮ = not known
        self.assertEqual(e["page"], 10)

    def test_dates_composed_and_copied_normalized(self):
        e = self.by_no[19]
        self.assertEqual((e["composed"], e["copied"]), ("ਸੰਮਤ ੧੮੩੫ ਬਿ.", "ਸੰਮਤ ੧੮੯੭ ਬਿ."))

    def test_single_date_is_the_copy_date(self):
        e = self.by_no[20]
        self.assertEqual((e["composed"], e["copied"]), (None, "੧੯ਵੀਂ ਸਦੀ ਬਿ."))
        self.assertEqual(e["scribe"], "ਭਾਈ ਅਤਰ ਸਿੰਘ")

    def test_contents_of_a_multi_text_ms(self):
        e = self.by_no[20]
        self.assertEqual(e["title"], "ਗੋਸ਼ਟਿ ਸਿੱਧਾਂ ਕੀ")
        self.assertEqual(e["contents"], [
            {"title": "ਗੋਸ਼ਟਿ ਸਿੱਧਾਂ ਕੀ", "author": None},
            {"title": "ਗੋਸ਼ਟਿ ਅਜਿੱਤੇ ਰੰਧਾਵੇ ਦੀ", "author": "ਭਾਈ ਮਨੀ ਸਿੰਘ"},
        ])

    def test_ms_number_on_the_next_line_and_ocr_noise_date_kept_as_text(self):
        e = self.by_no[21]
        self.assertEqual(e["ms_no"], "1111")
        self.assertEqual(e["title"], "ਗੀਤਾ ਕਾ ਅਠਾਰ੍ਹਵਾਂ ਧਿਆਇ (ਕਥਾ ਸਤਿਜੁਗ ਕੀ ਆਦਿ ਸਮੇਤ)")
        self.assertEqual(e["copied"], "ਸੰਮਤ ੧੯੩੯੮ ਬਿ.")
        self.assertTrue(e["ocr_doubt"])


class OcrVariants(unittest.TestCase):
    def setUp(self):
        self.by_no = {e["no"]: e for e in parse_entries(PAGES)}

    def test_ms_marker_variants_and_a_blank_line(self):
        self.assertEqual((self.by_no[22]["ms_no"], self.by_no[23]["ms_no"]), ("782", "3972"))

    def test_translator_and_composition_year_in_the_author_field(self):
        e = self.by_no[22]
        self.assertEqual((e["author"], e["translator"]), ("ਕਵਿ ਚਤੁਰ ਦਾਸ", "ਕਵੀ ਨਾਨਕ ਦਾਸ"))
        self.assertEqual(e["composed"], "ਸੰਮਤ ੧੬੯੨ ਬਿ.")

    def test_sammat_and_bi_ocr_slips(self):
        self.assertEqual(self.by_no[22]["copied"], "ਸੰਮਤ ੧੮੨੨ ਬਿ.")
        self.assertIsNone(self.by_no[22]["scribe"])  # ਨਾਮਾਲੂਮ, run together

    def test_ms_marker_without_colon_and_another_slip(self):
        self.assertEqual((self.by_no[24]["ms_no"], self.by_no[25]["ms_no"]), ("1810", "1562"))
        self.assertEqual(self.by_no[24]["title"], "ਗੁਰ ਬਿਲਾਸ ਪਾਤਸ਼ਾਹੀ ੬ (ਅਧੂਰਾ)")

    def test_entry_held_elsewhere_has_no_ms_number(self):
        e = self.by_no[26]
        self.assertEqual((e["ms_no"], e["title"], e["author"]), (None, "ਕਿੱਸਾ ਬਦਰਿ ਮੁਨੀਰ ਗੁ. ਰਾ. ਦਾ. ਲਾ", "ਕਵਿ ਸੁੰਦਰ"))
        self.assertEqual(e["copied"], "੮੦ ਕੁ ਸਾਲ ਦੀ ਪੁਰਾਣੀ ਲਿਖਤ ਹੈ")  # a relative age: kept as text

    def test_century_ocr_slips_and_scribe_variant(self):
        self.assertEqual(self.by_no[24]["copied"], "੧੯ਵੀਂ ਸਦੀ ਬਿ.")
        self.assertIsNone(self.by_no[24]["scribe"])

    def test_bikrami_word_is_left_whole(self):
        self.assertEqual(self.by_no[23]["copied"], "੧੮ਵੀਂ ਸਦੀ ਬਿਕ੍ਰਮੀ")


BV2 = {
    13: """ਆਤਮ ਦਰਪਨ ਪੋਥੀ ਸਮਾਪਤ । (ਪੱਤਰਾ ੬)
੯. ਆਤਮ ਵਿਚਾਰ ਗੌਥ (ਨੰ. ੧੨੩, ਪੰ. ਯੂ. ਚੋ.)

ਲੇਖਕ--ਕਵੀ ਮਾਨ ਸਿੰਘ ।
ਵੇਰਵਾ--ਪੱਤਰੇ ੮੪; ਕਾਗ਼ਜ਼ ਦੇਸੀ
ਸਮਾਂ--੧੯ਵੀਂ ਸਦੀ ਬਿ. । ਲਿਖਾਰੀ--ਲੇਖਕ ਖ਼ੁਦ '
4, (ਓ) ਉਪਨਿਖਦ-ਸੰਗ੍ਹ (ਕਥਾ ਗੁਜਰੀ ਕੀ ਸਮੇਤ) (ਨੰ. ੪੨੩, ਡਾ. ਗੰ. ਸਿੰ.)
(ਘ) ਅਨੰਦਵਲੀ ਉਪਨੇਖਦ ,, ੧੮੯---੨੦੨,
(੧੫) ਨੰਗਲ ਉਪਨਿਖਦ (, ,) ੪੨੯--੩੨,
ਸਮਾਂ--ਸੰਮਤ ੧੮੭੦ ਬਿ.
੧੦. ਉਪਨਿਖਦ-ਸੰੌਗ੍ਰਹ ਭਾਖਾ (ਨੰ. ਨ, ਸਿ. ਕੰ. ਮ. ਵਿ. ਫ਼ੀ.)
ਸਮਾਂ--ਸੰਮਤ ੧੯੦੦ ਬਿ.
""",
}


class Volume2(unittest.TestCase):
    def setUp(self):
        self.by_no = {e["no"]: e for e in parse_entries(BV2, style="bv2")}

    def test_headers_with_ms_number_and_holder(self):
        e = self.by_no[9]
        self.assertEqual((e["title"], e["ms_no"], e["holder"]), ("ਆਤਮ ਵਿਚਾਰ ਗੌਥ", "123", "ਪੰ. ਯੂ. ਚੋ."))
        self.assertEqual((e["author"], e["folios"], e["copied"]), ("ਕਵੀ ਮਾਨ ਸਿੰਘ", 84, "੧੯ਵੀਂ ਸਦੀ ਬਿ."))

    def test_ocr_number_and_contents_without_authors(self):
        e = self.by_no[4]
        self.assertEqual((e["title"], e["ms_no"]), ("ਉਪਨਿਖਦ-ਸੰਗ੍ਹ (ਕਥਾ ਗੁਜਰੀ ਕੀ ਸਮੇਤ)", "423"))
        self.assertEqual([c["title"] for c in e["contents"]], ["ਅਨੰਦਵਲੀ ਉਪਨੇਖਦ", "ਨੰਗਲ ਉਪਨਿਖਦ"])

    def test_no_number(self):
        self.assertIsNone(self.by_no[10]["ms_no"])

    def test_holder_lookup_by_consonants(self):
        self.assertEqual(holder("ਪੰ. ਯੂ. ਚੋ.")["name"], "Panjab University Library, Chandigarh")
        self.assertEqual(holder("ਡਾ. ਗੰ. ਸਿੰ.")["name"], "Dr Ganda Singh, Lower Mall, Patiala")
        self.assertTrue(holder("ਡਾ. ਗੰ. ਸਿੰ.")["private"])
        self.assertEqual(holder("ਸਿ. ਕੇ. ਮ. ਵਿ, ਫ਼ੀ.")["name"], "Sikh Kanya Maha Vidyalaya, Firozpur")
        self.assertIsNone(holder("ਕ. ਖ. ਗ."))

    def test_holder_ocr_slips(self):
        self.assertEqual(holder("ਮ. ਕਾ. ੫.")["name"], "Mahendra College Library, Patiala")  # ੫ for ਪ
        self.assertEqual(holder("ਪੋ. ਪ੍ਰੀ. ਸਿੰ.")["name"], "Prof. Pritam Singh, Mahendra College, Patiala")
        self.assertEqual(holder("ਡਾ. ਹੈ, ਸਿੰ")["name"], "Dr Ganda Singh, Lower Mall, Patiala")

    def test_vol1_abbreviations_are_marked_inferred(self):
        h = holder("ਭਾ. ਵਿ.")
        self.assertEqual((h["name"], h["inferred"]), ("Bhasha Vibhag (Languages Department), Patiala", True))
        self.assertFalse(holder("ਪੰ. ਯੂ. ਚੋ.")["inferred"])

    def test_finds_name_the_holder(self):
        v = to_finds([{**self.by_no[9], "catalogue": "bhasha-vibhag-1963-v2"}], CAT)["versions"][0]
        self.assertEqual((v["repository"], v["shelfmark"]), ("Panjab University Library, Chandigarh", "MS 123"))
        v = to_finds([{**self.by_no[4], "catalogue": "bhasha-vibhag-1963-v2"}], CAT)["versions"][0]
        self.assertEqual(v["repository"], "Dr Ganda Singh, Lower Mall, Patiala")
        self.assertIn("private collection", v["notes"])
        v = to_finds([{**self.by_no[9], "holder": "ਭਾ. ਵਿ.", "catalogue": "bhasha-vibhag-1963-v2"}], CAT)["versions"][0]
        self.assertIn("inferred", v["notes"])


class Dates(unittest.TestCase):
    def test_split(self):
        self.assertEqual(split_dates("ਰਚਨਾ ਕਾਲ : ਸੰਮਤ ੧੮੩੫ ਬਿ:, ਨਕਲ : ਸੰਮਤ ੧੮੯੭ ਬਿ."),
                         ("ਸੰਮਤ ੧੮੩੫ ਬਿ.", "ਸੰਮਤ ੧੮੯੭ ਬਿ."))
        self.assertEqual(split_dates("ਸੰਮਤ ੧੮੯੭ ਬਿ: ।"), (None, "ਸੰਮਤ ੧੮੯੭ ਬਿ."))
        self.assertEqual(split_dates("ਨਾ ਮਾਲੂਮ"), (None, None))

    def test_bikrami_marker_ocr_slips(self):
        self.assertEqual(split_dates("੧੬ਵੀਂ ਸਦੀ ਬਿਕ੍ਮੀ"), (None, "੧੬ਵੀਂ ਸਦੀ ਬਿਕ੍ਰਮੀ"))
        self.assertEqual(split_dates("੧੬ਵੀਂ ਸਦੀ ਭਿ. । _"), (None, "੧੬ਵੀਂ ਸਦੀ ਬਿ."))


class Roman(unittest.TestCase):
    def test_plain_ascii_with_schwa_deleted(self):
        self.assertEqual(roman("ਅਧਿਆਤਮ ਰਾਮਾਇਣ"), "Adhiatam Ramain")
        self.assertEqual(roman("ਮੋਖ ਪੰਥ ਪ੍ਰਕਾਸ਼"), "Mokh Panth Prakash")
        self.assertEqual(roman("ਗੋਸ਼ਟਿ ਸਿੱਧਾਂ ਕੀ"), "Goshti Siddhan Ki")

    def test_match_key_bridges_spellings(self):
        self.assertEqual(match_key("Adhyatma Ramayan"), match_key(roman("ਅਧਿਆਤਮ ਰਾਮਾਇਣ")))
        self.assertEqual(match_key("Singh-Gau ki Katha"), match_key(roman("ਸਿੰਘ-ਗਊ ਕੀ ਕਥਾ")))
        self.assertNotEqual(match_key("Gur Kirat Prakash"), match_key("Gur Panth Prakash"))


CAT = {"version": 1, "works": [
    {"id": "w-adhiatam-ramayan", "title": {"roman": "Adhyatma Ramayan"}, "status": "catalogued"},
    {"id": "w-old", "title": {"roman": "Goshti Siddhan Ki"}, "status": "rejected"},
], "versions": []}


def entry(**kw):
    e = {"catalogue": "sgpc-1968", "no": 1, "ms_no": "100", "title": "ਅਧਿਆਤਮ ਰਾਮਾਇਣ", "page": 20, "author": None,
         "translator": None, "folios": None, "composed": None, "copied": None, "place": None, "scribe": None,
         "contents": [], "ocr_doubt": False}
    e.update(kw)
    return e


class FixTitle(unittest.TestCase):
    def test_tippi_misread_fixed_only_when_the_lexicon_knows_the_word(self):
        self.assertEqual(fix_title("ਭਾਗਵਤ ਪੁਰਾਣ (ਨਵਮ ਸਕੇਧ)"), "ਭਾਗਵਤ ਪੁਰਾਣ (ਨਵਮ ਸਕੰਧ)")
        self.assertEqual(fix_title("ਘਟ ਰਾਮਾਇਣ ਗ੍ਰ੍ਥ"), "ਘਟ ਰਾਮਾਇਣ ਗ੍ਰੰਥ")
        self.assertEqual(fix_title("ਬਿਸਨੁ ਪੁਰਾਣ ਵੇਦਾਂਤ"), "ਬਿਸਨੁ ਪੁਰਾਣ ਵੇਦਾਂਤ")  # no known fix: left alone

    def test_leading_sri(self):
        self.assertEqual(fix_title("ਸੀ ਨਾਨਕ ਰਮਾਇਣ"), "ਸ੍ਰੀ ਨਾਨਕ ਰਮਾਇਣ")

    def test_leftover_item_markers_page_numbers_and_lone_letters(self):
        self.assertEqual(fix_title("(9ਉ) ਨਿਰਵਾਣ ਪ੍ਰਕਰਣ ਦੀਆਂ ਕਥਾਂ"), "ਨਿਰਵਾਣ ਪ੍ਰਕਰਣ ਦੀਆਂ ਕਥਾਂ")
        self.assertEqual(fix_title("(9੪) ਸਇਕਾਦਸ਼ੀ ਮਹਾਤਮ"), "ਸਇਕਾਦਸ਼ੀ ਮਹਾਤਮ")
        self.assertEqual(fix_title("0ਉਂ) ਪਰਚੀ ਹਿੰਦਾਲ ਕੀ"), "ਪਰਚੀ ਹਿੰਦਾਲ ਕੀ")
        self.assertEqual(fix_title("09ਉ) ਪ੍ਰਾਣ ਸੰਗਲੀ"), "ਪ੍ਰਾਣ ਸੰਗਲੀ")
        self.assertEqual(fix_title("(0(ਉ) ਤਿਲ ਸ਼ਤ ਭਾਖਾ)"), "ਤਿਲ ਸ਼ਤ ਭਾਖਾ")
        self.assertEqual(fix_title("ਸੋਨਿਕ ਉਪਨਿਖਦ 3੭"), "ਸੋਨਿਕ ਉਪਨਿਖਦ")
        self.assertEqual(fix_title("ਭਾਗਵਤ ਇਕਾਦਸ਼ ਸਕੰਧ ਰ"), "ਭਾਗਵਤ ਇਕਾਦਸ਼ ਸਕੰਧ")
        self.assertEqual(fix_title("ਪਖਿਆਨ ਚਰਿਤ੍ਰ ੭"), "ਪਖਿਆਨ ਚਰਿਤ੍ਰ ੭")  # a Gurmukhi numeral can be part of the title

    def test_unclosed_bracket_is_closed(self):
        self.assertEqual(fix_title("ਯੋਗ ਵਸਿਸ਼ਟ (ਮਹਾ ਰਾਮਾਇਣ"), "ਯੋਗ ਵਸਿਸ਼ਟ (ਮਹਾ ਰਾਮਾਇਣ)")

    def test_stray_marks_trimmed(self):
        self.assertEqual(fix_title("ਸ਼੍ਰੀ ਰਾਮ ਚਰਿਤ ਮਾਨਸ ੍"), "ਸ਼੍ਰੀ ਰਾਮ ਚਰਿਤ ਮਾਨਸ")
        self.assertEqual(fix_title("ਰਾਮਾਸ਼੍ਰਮੋਧ . ,- --“"), "ਰਾਮਾਸ਼੍ਰਮੋਧ")


class ToFinds(unittest.TestCase):
    def test_known_work_gets_a_catalogue_record_version(self):
        finds = to_finds([entry(copied="ਸੰਮਤ ੧੮੯੭ ਬਿ.", folios=190, scribe="ਭਾਈ ਅਤਰ ਸਿੰਘ", place="ਅੰਮ੍ਰਿਤਸਰ")], CAT)
        v = finds["versions"][0]
        self.assertEqual(v["contains"], [{"work_id": "w-adhiatam-ramayan"}])
        self.assertEqual((v["type"], v["availability"], v["date"]), ("catalogue-record", "none", "ਸੰਮਤ ੧੮੯੭ ਬਿ."))
        self.assertEqual((v["repository"], v["shelfmark"]), (CATALOGUES["sgpc-1968"]["repository"], "MS 100"))
        self.assertEqual(v["contributors"], "ਭਾਈ ਅਤਰ ਸਿੰਘ (scribe)")
        self.assertIn("190 ff.", v["label"])
        self.assertIn("Ashok 1968, no. 1", v["label"])
        self.assertIn("ਅੰਮ੍ਰਿਤਸਰ", v["notes"])

    def test_unknown_work_by_title_with_gurmukhi_author_and_composed(self):
        finds = to_finds([entry(title="ਮੋਖ ਪੰਥ ਪ੍ਰਕਾਸ਼", author="ਗੁਲਾਬ ਸਿੰਘ", composed="ਸੰਮਤ ੧੮੩੫ ਬਿ.")], CAT)
        c = finds["versions"][0]["contains"][0]
        self.assertEqual(c, {"work_title": "Mokh Panth Prakash", "gurmukhi": "ਮੋਖ ਪੰਥ ਪ੍ਰਕਾਸ਼",
                             "authors": ["ਗੁਲਾਬ ਸਿੰਘ"], "composed": "ਸੰਮਤ ੧੮੩੫ ਬਿ."})

    def test_rejected_works_are_not_matched(self):
        c = to_finds([entry(title="ਗੋਸ਼ਟਿ ਸਿੱਧਾਂ ਕੀ")], CAT)["versions"][0]["contains"][0]
        self.assertNotIn("work_id", c)

    def test_spelling_variants_share_one_new_work(self):
        finds = to_finds([entry(no=1, ms_no="1", title="ਬਿਸ਼ਨੁ ਪੁਰਾਣ ਭਾਖਾ"),
                          entry(no=2, ms_no="2", title="ਬਿਸਨੁ ਪੁਰਾਣ ਭਾਖਾ")], CAT)
        t = [v["contains"][0]["work_title"] for v in finds["versions"]]
        self.assertEqual(t[0], t[1])

    def test_multi_text_ms_contains_each_text(self):
        finds = to_finds([entry(title="ਗੋਸ਼ਟਿ ਸਿੱਧਾਂ ਕੀ", contents=[
            {"title": "ਅਧਿਆਤਮ ਰਾਮਾਇਣ", "author": None}, {"title": "ਗੋਸ਼ਟਿ ਅਜਿੱਤੇ ਰੰਧਾਵੇ ਦੀ", "author": "ਭਾਈ ਮਨੀ ਸਿੰਘ"}])], CAT)
        cs = finds["versions"][0]["contains"]
        self.assertEqual(cs[0], {"work_id": "w-adhiatam-ramayan"})
        self.assertEqual((cs[1]["gurmukhi"], cs[1]["authors"]), ("ਗੋਸ਼ਟਿ ਅਜਿੱਤੇ ਰੰਧਾਵੇ ਦੀ", ["ਭਾਈ ਮਨੀ ਸਿੰਘ"]))

    def test_work_titles_are_ocr_fixed_but_the_label_keeps_the_ocr(self):
        v = to_finds([entry(title="ਭਾਗਵਤ ਪੁਰਾਣ ਨਵਮ ਸਕੇਧ")], CAT)["versions"][0]
        self.assertEqual(v["contains"][0]["gurmukhi"], "ਭਾਗਵਤ ਪੁਰਾਣ ਨਵਮ ਸਕੰਧ")
        self.assertIn("ਸਕੇਧ", v["label"])

    def test_qualifiers_leave_the_work_title(self):
        finds = to_finds([entry(title="ਗੁਰ ਬਿਲਾਸ ਪਾਤਸ਼ਾਹੀ ੬ (ਅਧੂਰਾ)"),
                          entry(no=2, ms_no="2", title="ਸ੍ਰੀ ਮਦ ਭਗਵਤ ਗੀਤਾ (ਜਪੁਜੀ ਆਦਿ ਸਮੇਤ)")], CAT)
        a, b = (v["contains"][0] for v in finds["versions"])
        self.assertEqual((a["gurmukhi"], b["gurmukhi"]), ("ਗੁਰ ਬਿਲਾਸ ਪਾਤਸ਼ਾਹੀ ੬", "ਸ੍ਰੀ ਮਦ ਭਗਵਤ ਗੀਤਾ"))
        self.assertIn("(ਅਧੂਰਾ)", finds["versions"][0]["label"])

    def test_author_junk_cleaned(self):
        c = to_finds([entry(title="ਪਾਰਸ ਭਾਗ ਨਵਾਂ", author="ਸਾ£)' ਅੱਡਣ ਸ਼ਾਹ")], CAT)["versions"][0]["contains"][0]
        self.assertEqual(c["authors"], ["ਸਾ ਅੱਡਣ ਸ਼ਾਹ"])

    def test_ocr_doubt_drops_the_date_into_a_note(self):
        v = to_finds([entry(copied="ਸੰਮਤ ੧੯੩੯੮ ਬਿ.", ocr_doubt=True)], CAT)["versions"][0]
        self.assertNotIn("date", v)
        self.assertIn("ਸੰਮਤ ੧੯੩੯੮ ਬਿ.", v["notes"])

    def test_held_elsewhere_has_no_shelfmark(self):
        v = to_finds([entry(ms_no=None)], CAT)["versions"][0]
        self.assertNotIn("shelfmark", v)
        self.assertIn("no MS number", v["notes"])


if __name__ == "__main__":
    unittest.main()
