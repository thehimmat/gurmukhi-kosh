#!/usr/bin/env python3
"""Tests for the deterministic Mahan Kosh sense parser (issue #32).

All fixture strings are real sense texts (or close excerpts) from
pipeline/mahan-kosh/output/entries.jsonl.

Run from the project root:
  python3 -m unittest pipeline.mahan-kosh.test_parse_shorthand   # (module path has a dash: use the file runner instead)
  python3 pipeline/mahan-kosh/test_parse_shorthand.py
"""

import unicodedata
import unittest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from parse_shorthand import parse_sense  # noqa: E402


class HeadMarkers(unittest.TestCase):
    def test_language_then_pos_noun(self):
        # ਪਾਣੀ sense 1: Sanskrit origin (etymon paraphrased in Gurmukhi, which
        # v1 leaves unextracted), then noun marker, gloss, quote + citation.
        s = parse_sense('ਸੰ. ਪਾਨੀਯ. ਸੰਗ੍ਯਾ- ਜਲ. "ਪਾਣੀ ਅੰਦਿਰ ਲੀਕ ਜਿਉ." (ਵਾਰ ਆਸਾ ਮਃ ੨)')
        self.assertEqual([o["language"] for o in s["language_origins"]], ["Sanskrit"])
        self.assertEqual([p["pos"] for p in s["pos"]], ["noun"])
        self.assertEqual(len(s["quotes"]), 1)
        cit = s["citations"][0]
        self.assertEqual(cit["raag"], "ਆਸਾ")
        self.assertEqual(cit["mahala"], 2)
        self.assertTrue(cit["is_vaar"])
        self.assertIn("ਜਲ", s["residue"])
        self.assertNotIn("ਸੰਗ੍ਯਾ", s["residue"])
        self.assertNotIn("ਪਾਣੀ ਅੰਦਿਰ", s["residue"])

    def test_perso_arabic_etymon(self):
        s = parse_sense('ਫ਼ਾ. [زور] ਜ਼ੋਰ. ਸੰਗ੍ਯਾ- ਬਲ. "ਜੋਰ ਜੁਲਮ ਫੂਲਹਿ ਘਣੋ." (ਵਾਰ ਸਾਰ ਮਃ ੧)')
        o = s["language_origins"][0]
        self.assertEqual(o["language"], "Persian")
        self.assertEqual(o["etymon"]["script"], "perso_arabic")
        self.assertEqual(o["etymon"]["text"], "زور")
        self.assertEqual(s["pos"][0]["pos"], "noun")

    def test_devanagari_etymon_and_verbal_root(self):
        s = parse_sense("ਸੰ. गुर ਧਾ- ਯਤਨ ਕਰਨਾ, ਉੱਦਮ ਕਰਨਾ, ਮਾਰਨਾ.")
        o = s["language_origins"][0]
        self.assertEqual(o["language"], "Sanskrit")
        self.assertEqual(o["etymon"]["script"], "devanagari")
        self.assertEqual(o["etymon"]["text"], "गुर")
        self.assertEqual(s["pos"][0]["pos"], "verbal_root")

    def test_gurmukhi_transcribed_etymon(self):
        # ਸੰ. ਪਾਨੀਯ. ਸੰਗ੍ਯਾ- : the etymon is transcribed in Gurmukhi rather than
        # Devanagari. Captured only when the very next token is another marker,
        # and flagged inferred (it is our reading, not script-explicit).
        s = parse_sense("ਸੰ. ਪਾਨੀਯ. ਸੰਗ੍ਯਾ- ਜਲ.")
        o = s["language_origins"][0]
        self.assertEqual(o["language"], "Sanskrit")
        self.assertEqual(o["etymon"]["script"], "gurmukhi")
        self.assertEqual(o["etymon"]["text"], "ਪਾਨੀਯ")
        self.assertTrue(o["etymon"]["inferred"])
        self.assertNotIn("ਪਾਨੀਯ", s["residue"])
        self.assertIn("ਜਲ", s["residue"])

    def test_no_gurmukhi_etymon_when_pos_follows_directly(self):
        # ਡਿੰਗ. ਸੰਗ੍ਯਾ- ਨਾਭੀ : no transcription slot between marker and POS,
        # and the first gloss must never be mistaken for an etymon.
        s = parse_sense("ਡਿੰਗ. ਸੰਗ੍ਯਾ- ਨਾਭੀ. ਤੁੰਨ. ਧੁੰਨੀ.")
        self.assertIsNone(s["language_origins"][0]["etymon"])
        self.assertIn("ਨਾਭੀ", s["residue"])

    def test_no_gurmukhi_etymon_from_plain_gloss(self):
        # ਸਿੰਧੀ. ਬੱਸ. ਹੋਰ ਨਹੀਂ : the token after the marker is a gloss (next
        # token is prose, not a marker), so nothing is claimed as etymon.
        s = parse_sense("ਸਿੰਧੀ. ਬੱਸ. ਹੋਰ ਨਹੀਂ.")
        self.assertIsNone(s["language_origins"][0]["etymon"])
        self.assertIn("ਬੱਸ", s["residue"])

    def test_nfc_input_still_matches(self):
        # precomposed ਫ਼ (U+0A5E): parser must normalize
        s = parse_sense(unicodedata.normalize("NFC", "ਫ਼ਾ. [نام] ਸੰਗ੍ਯਾ- ਨਾਉਂ."))
        self.assertEqual(s["language_origins"][0]["language"], "Persian")

    def test_adverb_two_token_marker(self):
        s = parse_sense('ਕ੍ਰਿ. ਵਿ- ਬੇਮੌਕਾ. ਜੋ ਸਮੇਂ ਸਿਰ ਨਹੀਂ.')
        self.assertEqual(s["pos"][0]["pos"], "adverb")
        # the two-token marker must not also emit a stray adjective
        self.assertEqual(len(s["pos"]), 1)

    def test_no_false_urdu_or_punjabi_markers(self):
        # ਭਾਉ. ends with ਉ. — the old scraper tagged this Urdu; the parser must not
        s = parse_sense('ਪ੍ਰਭਾਵ. ਅਸਰ. "ਸਿਖਸਭਾ ਦੀਖਿਆ ਕਾ ਭਾਉ." (ਆਸਾ ਮਃ ੧)')
        self.assertEqual(s["language_origins"], [])
        # ਦੇਸ਼. as a gloss word stays in the residue, tagged nothing
        s2 = parse_sense("ਅਸਥਾਨ. ਦੇਸ਼. ਮੁਲਕ.")
        self.assertEqual(s2["language_origins"], [])
        self.assertIn("ਦੇਸ਼", s2["residue"])


class Xrefs(unittest.TestCase):
    def test_simple_xref(self):
        s = parse_sense("ਦੇਖੋ, ਨਾਮ.")
        self.assertEqual(s["xrefs"][0]["target"], "ਨਾਮ")
        self.assertIsNone(s["xrefs"][0]["sense_number"])

    def test_xref_with_sense_number(self):
        s = parse_sense("ਸਮੇਤ. ਸਾਥ. ਦੇਖੋ, ਮਯ ੭.")
        self.assertEqual(s["xrefs"][0]["target"], "ਮਯ")
        self.assertEqual(s["xrefs"][0]["sense_number"], 7)

    def test_xref_clause_leaves_residue_clean(self):
        s = parse_sense("ਦੇਖੋ, ਸਤ ਅਤੇ ਸਤ੍ਯ ਸ਼ਬਦ. ਸਤ੍ਯ ਰੂਪ ਪਾਰਬ੍ਰਹਮ.")
        self.assertNotIn("ਦੇਖੋ", s["residue"])
        self.assertIn("ਪਾਰਬ੍ਰਹਮ", s["residue"])

    # -- #75: ਦੇਖੋ followed by prose is a sentence, not a pointer. A clause
    # that does not reduce to head-word-shaped targets extracts nothing and
    # stays in the residue whole.

    def test_prose_citation_list_not_captured(self):
        # real artifact: a Quran citation, not a Mahan Kosh head-word
        s = parse_sense("ਦੇਖੋ, ਸੂਰਤ ਬਕਰ, ਆਯਤ ੭੧, ਯਹੂਦੀ ਸੂਰ ਨੂੰ ਇਸ ਲਈ ਅਪਵਿਤ੍ਰ ਮੰਨਦੇ ਹਨ.")
        self.assertEqual(s["xrefs"], [])
        self.assertIn("ਦੇਖੋ", s["residue"])
        self.assertIn("ਯਹੂਦੀ", s["residue"])

    def test_midsentence_prose_dekho_left_alone(self):
        s = parse_sense("ਇਸ ਦੀ ਉਤਪੱਤੀ ਦਾ ਨਿਰਣਾ ਦੇਖੋ, ਸਗਰ ਸ਼ਬਦ ਵਿੱਚ.")
        self.assertEqual(s["xrefs"], [])
        self.assertIn("ਸਗਰ", s["residue"])

    def test_sggs_citation_after_dekho_not_captured(self):
        s = parse_sense("ਦੇਖੋ, ਆਸਾ ਮਃ ੫, ਸ਼ਬਦ ਨੰਃ ੩, ਵਾਰ ਆਸਾ ਦੀ ਪੌੜੀ.")
        self.assertEqual(s["xrefs"], [])
        self.assertIn("ਪੌੜੀ", s["residue"])

    def test_verbal_root_qualifier_stripped(self):
        # 'ਦੇਖੋ, ਭੂ ਧਾ' points at the root entry ਭੂ, like 'X ਸ਼ਬਦ' points at X
        s = parse_sense("ਦੇਖੋ, ਭੂ ਧਾ.")
        self.assertEqual(s["xrefs"][0]["target"], "ਭੂ")
        self.assertNotIn("ਦੇਖੋ", s["residue"])
        # ZWNJ after a virama-final root must not block the match
        s2 = parse_sense("ਦੇਖੋ, ਰਮ੍‌ ਧਾ.")
        self.assertEqual(s2["xrefs"][0]["target"], "ਰਮ੍")

    def test_paren_prose_xref_stays_in_residue(self):
        s = parse_sense("ਛੰਦ ਦਾ ਨਾਮ (ਦੇਖੋ ਸਵੈਯੇ ਦਾ ਰੂਪ ਗੁਰੁ ਛੰਦ ਦਿਵਾਕਰ ਵਿੱਚ) ਹੈ.")
        self.assertEqual(s["xrefs"], [])
        self.assertIn("ਦਿਵਾਕਰ", s["residue"])


class Citations(unittest.TestCase):
    def test_named_work_dasam(self):
        s = parse_sense('"ਦੂਰ ਕਰੈ ਸਤਿ ਬੈਦ ਰੋਗ ਸੰਨਿਪਾਤ ਕੋ." (ਕ੍ਰਿਸਨਾਵ)')
        c = s["citations"][0]
        self.assertEqual(c["work_type"], "dasam_granth")
        self.assertEqual(c["work"], "Krishna Avtar")

    def test_bhai_gurdas_kabitt_multitoken(self):
        s = parse_sense('"ਗੁਰੁਮਤਿ ਸਤਿ ਕਰ ਚੰਚਲ ਅਚਲ ਭਏ." (ਭਾਗੁ ਕ)')
        c = s["citations"][0]
        self.assertEqual(c["work_type"], "other_works")
        self.assertIn("Kabitt", c["work"])

    def test_bhatt_savaiye(self):
        s = parse_sense('"ਮੂਰਤਿ ਪੰਚ ਪ੍ਰਮਾਣ ਪੁਰਖ." (ਸਵੈਯੇ ਮਃ ੫. ਕੇ)')
        c = s["citations"][0]
        self.assertEqual(c["mahala"], 5)
        self.assertIn("Savaiye", c["work"])

    def test_salok_bhagat(self):
        s = parse_sense('"ਹੈ ਗਇ ਬਾਹਨ." (ਸ. ਕਬੀਰ)')
        c = s["citations"][0]
        self.assertEqual(c["bhagat"], "ਕਬੀਰ")
        self.assertEqual(c["section"], "ਸਲੋਕ")

    def test_vaar_with_number(self):
        s = parse_sense('"ਨਾਉ ਕਰਤਾ ਕਾਦਰ ਕਰੈ." (ਵਾਰ ਰਾਮ ੩)')
        c = s["citations"][0]
        self.assertEqual(c["raag"], "ਰਾਮ")
        self.assertTrue(c["is_vaar"])
        self.assertEqual(c["vaar_number"], 3)

    def test_gloss_paren_is_not_a_citation(self):
        s = parse_sense("ਕਰ (ਹੱਥ) ਵਿੱਚ. ਕਰ ਮੇਂ.")
        self.assertEqual(s["citations"], [])
        self.assertIn("(ਹੱਥ)", s["residue"])

    def test_superscript_footnote_digit_does_not_crash(self):
        # ਯੋਗ sense 3 (2026-08-19 scrape): the print carries a footnote
        # superscript after a Gurmukhi digit (ਸੂਤ੍ਰ ੨¹). str.isdigit() is true
        # for ¹ but int() rejects it — the token must read as non-numeric.
        s = parse_sense(
            "ਚਿੱਤ ਦੀ ਵ੍ਰਿੱਤਿ ਦਾ ਰੋਕਣਾ. (ਪਾਤੰਜਲ ਦਰਸ਼ਨ. ਪਾਦ ੧. ਸੂਤ੍ਰ ੨¹) ਦੇਖੋ, ਸਹਜ ਜੋਗ ਅਤੇ ਜੋਗ."
        )
        self.assertIn("ਰੋਕਣਾ", s["residue"])

    def test_quote_citation_pairing(self):
        s = parse_sense('ਸੰਗ੍ਯਾ- ਧਰਮ. "ਨਹਿ ਬਿਲੰਬ ਧਰਮੰ." (ਸਹਸ ਮਃ ੫) "ਸਾਧ ਕੈ ਸੰਗਿ." (ਸੁਖਮਨੀ)')
        self.assertEqual(len(s["quotes"]), 2)
        self.assertEqual(s["quotes"][0]["citation_index"], 0)
        self.assertEqual(s["quotes"][1]["citation_index"], 1)
        self.assertEqual(s["citations"][1]["work"], "Sukhmani Sahib (Gauri M5)")


class GrammarFrames(unittest.TestCase):
    def test_plural_frame(self):
        s = parse_sense('ਸਰਵ- ਉਹ ਦਾ ਬਹੁ ਵਚਨ. ਵੇ. ਓਹ.')
        self.assertEqual(s["pos"][0]["pos"], "pronoun")
        g = s["grammar"][0]
        self.assertEqual(g["attribute"], "number")
        self.assertEqual(g["value"], "plural")
        self.assertEqual(g["referent"], "ਉਹ")

    def test_imperative_frame(self):
        s = parse_sense("ਲਿਖਣਾ ਕ੍ਰਿਯਾ ਦਾ ਅਮਰ.")
        g = s["grammar"][0]
        self.assertEqual(g["attribute"], "mood")
        self.assertEqual(g["value"], "imperative")
        self.assertEqual(g["referent"], "ਲਿਖਣਾ")

    def test_vocative(self):
        s = parse_sense("ਵ੍ਯ- ਸੰਬੋਧਨ. ਹੇ ਸ਼ਾਹ!")
        self.assertEqual(s["pos"][0]["pos"], "particle")
        self.assertEqual(s["grammar"][0]["attribute"], "case")
        self.assertEqual(s["grammar"][0]["value"], "vocative")


class Structure(unittest.TestCase):
    def test_enumerators_stay_in_residue(self):
        s = parse_sense("ਚਾਰ ਪ੍ਰਕਾਰ ਦੇ ਗੁਰੂ ਹਨ-#(ੳ) ਭ੍ਰਿੰਗੀਗੁਰੁ. (ਅ) ਪਾਰਸ ਗੁਰੁ.")
        self.assertEqual(s["citations"], [])
        self.assertIn("(ੳ)", s["residue"])

    def test_hash_becomes_break(self):
        s = parse_sense("ਪਹਿਲਾ ਭਾਗ.#ਦੂਜਾ ਭਾਗ.")
        self.assertNotIn("#", s["residue"])
        self.assertIn("ਪਹਿਲਾ ਭਾਗ", s["residue"])
        self.assertIn("ਦੂਜਾ ਭਾਗ", s["residue"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
