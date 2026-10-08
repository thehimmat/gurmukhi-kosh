#!/usr/bin/env python3
"""Tests for the Mahan Kosh Private Use Area mapper (issue #150).

Every fixture is a real token from the live `definitions` table, with the
source font's glyph written as its \\uF0xx escape. The expected outputs follow
the mapping in pua_map.json (modern Punjabi spelling).

Run from the project root:
  python3 pipeline/mahan-kosh/test_pua.py
"""

import os
import sys
import unicodedata
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pua import clean_pua, find_pua  # noqa: E402


def n(s: str) -> str:
    """Expected strings are compared decomposed: the corpus writes nukta
    letters as base + U+0A3C, and ਸ਼/ਜ਼ are composition-excluded."""
    return unicodedata.normalize("NFD", s)


class SsaMark(unittest.TestCase):
    """F032 (narrow) / F03B (after ਾ ੀ ਾਂ): the dot that marks ਸ as ष."""

    def test_directly_after_sa(self):
        self.assertEqual(clean_pua("ਕ੍ਰਿਸ\uf032ਨ"), n("ਕ੍ਰਿਸ਼ਨ"))
        self.assertEqual(clean_pua("ਸ਼ੇਸ\uf032ਨਾਗ"), n("ਸ਼ੇਸ਼ਨਾਗ"))

    def test_typed_after_the_whole_conjunct(self):
        # The font draws the dot under ਸ but stores it after the cluster.
        self.assertEqual(clean_pua("ਸ੍ਰੇਸ੍ਠ\uf032"), n("ਸ੍ਰੇਸ਼੍ਠ"))
        self.assertEqual(clean_pua("ਸ੍ਰਿਸ੍ਟਿ\uf032ਰਚਨਾ"), n("ਸ੍ਰਿਸ਼੍ਟਿਰਚਨਾ"))
        self.assertEqual(clean_pua("ਕ੍ਰਿਸ੍ਨ\uf032"), n("ਕ੍ਰਿਸ਼੍ਨ"))

    def test_after_halant(self):
        self.assertEqual(clean_pua("ਉਸ੍\uf032. ਧਾ-"), n("ਉਸ਼੍. ਧਾ-"))

    def test_wide_variant_after_long_vowel(self):
        self.assertEqual(clean_pua("ਭਾਸਾ\uf03b"), n("ਭਾਸ਼ਾ"))
        self.assertEqual(clean_pua("ਨਿਸਾ\uf03bਦ"), n("ਨਿਸ਼ਾਦ"))
        self.assertEqual(clean_pua("ਸ੍ਰਿਸ੍ਟੀ\uf03b."), n("ਸ੍ਰਿਸ਼੍ਟੀ."))
        self.assertEqual(clean_pua("ਪੁਰੁਸਾਂ\uf03b"), n("ਪੁਰੁਸ਼ਾਂ"))

    def test_only_the_cluster_right_before_the_mark(self):
        # The first ਸ (ਸ੍ਰਿ) is a different cluster and keeps its spelling.
        out = clean_pua("ਸ੍ਰਿਸ੍ਟਿ\uf032")
        self.assertTrue(out.startswith("ਸ੍ਰਿ"))


class PersoArabicMarks(unittest.TestCase):
    """ص/ذ (F02F, F038), ث/ض (F031, F03A), ظ (F033, F03C). Modern Punjabi
    writes the ਸ-based ones plain and the ਜ-based ones as ਜ਼."""

    def test_sad_on_sa_is_plain(self):
        self.assertEqual(clean_pua("ਅ਼ਸ\uf02fਰ"), n("ਅ਼ਸਰ"))  # عصر
        self.assertEqual(clean_pua("ਸਾ\uf038ਹ਼ਿਬ"), n("ਸਾਹ਼ਿਬ"))  # صاحب
        self.assertEqual(clean_pua("ਹ਼ਿੱਸਾ\uf038"), n("ਹ਼ਿੱਸਾ"))  # حصه

    def test_dhal_on_ja_takes_nukta(self):
        self.assertEqual(clean_pua("ਮੁਅੱਜਿ\uf02fਨ"), n("ਮੁਅੱਜ਼ਿਨ"))  # موذن
        self.assertEqual(clean_pua("ਅ਼ਜਾ\uf038ਬ"), n("ਅ਼ਜ਼ਾਬ"))  # عذاب

    def test_the_and_dad(self):
        self.assertEqual(clean_pua("ਅਸ\uf031ਰ"), n("ਅਸਰ"))  # اثر
        self.assertEqual(clean_pua("ਹਜ\uf031ਰਤ"), n("ਹਜ਼ਰਤ"))  # حضرت
        self.assertEqual(clean_pua("ਜਿੱ\uf031ਦ"), n("ਜ਼ਿੱਦ"))  # ضد
        self.assertEqual(clean_pua("ਬੇਮਿਸਾ\uf03aਲ"), n("ਬੇਮਿਸਾਲ"))  # مثال
        self.assertEqual(clean_pua("ਜਾ\uf03aਇਅ਼"), n("ਜ਼ਾਇਅ਼"))  # ضائع

    def test_zah(self):
        self.assertEqual(clean_pua("ਨਜ\uf033ਰ"), n("ਨਜ਼ਰ"))  # نظر
        self.assertEqual(clean_pua("ਮਨਜੂ\uf033ਰ"), n("ਮਨਜ਼ੂਰ"))  # منظور
        self.assertEqual(clean_pua("ਜਾ\uf03cਲਿਮ"), n("ਜ਼ਾਲਿਮ"))  # ظالم

    def test_existing_nukta_is_not_doubled(self):
        self.assertEqual(clean_pua(n("ਨਜ਼") + "\uf033ਰ"), n("ਨਜ਼ਰ"))


class Reph(unittest.TestCase):
    """F02C: superscript ਰ, typed after the syllable it is pronounced before."""

    def test_moves_ra_halant_before_the_cluster(self):
        self.assertEqual(clean_pua("ਕਪੂ\uf02cਰ"), "ਕਰ੍ਪੂਰ")  # कर्पूर
        self.assertEqual(clean_pua("ਅਜੁ\uf02cਨ"), "ਅਰ੍ਜੁਨ")  # अर्जुन
        self.assertEqual(clean_pua("ਹਮ੍ਯ\uf02c."), "ਹਰ੍ਮ੍ਯ.")  # हर्म्य
        self.assertEqual(clean_pua("ਈਸਾ\uf02c."), "ਈਰ੍ਸਾ.")  # ईर्षा
        self.assertEqual(clean_pua("(ਅਬੁ\uf02cਦ)"), "(ਅਰ੍ਬੁਦ)")  # अर्बुद

    def test_override_for_the_one_misplaced_reph(self):
        # अपूर्ण: the source typed the glyph before ਣ, not after it.
        self.assertEqual(clean_pua("ਅਪੂ\uf02cਣ."), "ਅਪੂਰ੍ਣ.")

    def test_reph_stacked_after_a_mark(self):
        # आर्षेय, वर्षा: the ष-dot comes first, then the reph.
        self.assertEqual(clean_pua("ਆਸੇ\uf032\uf02cਯ"), n("ਆਰ੍ਸ਼ੇਯ"))
        self.assertEqual(clean_pua("ਵਸਾ\uf03b\uf02c"), n("ਵਰ੍ਸ਼ਾ"))

    def test_override_for_sad_glyph_used_as_ssa(self):
        # दुर्धर्ष (ਦੁੱਧਰ): the ص glyph stands in for ष here.
        self.assertEqual(clean_pua("ਦੁਰ੍\u200dਧਸ\uf02f\uf02c."), n("ਦੁਰ੍\u200dਧਰ੍ਸ਼."))


class Joiners(unittest.TestCase):
    def test_cluster_joined_with_zwnj(self):
        # ਕ਼ਸ੍\u200cਦ (قصد): ZWNJ after the halant is still one cluster.
        self.assertEqual(clean_pua("ਕ਼ਸ੍\u200cਦ\uf02f."), "ਕ਼ਸ੍\u200cਦ.")


class Characters(unittest.TestCase):
    def test_hora(self):
        # SGGS: "ਜੋ ਵੰਞੈ ਡੀਹੜਾ ਸੋ ਉਮਰ ਹਥ ਪਵਨਿ"
        self.assertEqual(clean_pua("ਡੀਹੜਾ ਸ\uf02b ਉਮਰ"), "ਡੀਹੜਾ ਸੋ ਉਮਰ")

    def test_scansion_marks(self):
        # ਯਗਣ = light, heavy, heavy
        self.assertEqual(clean_pua("ਦੋ ਯਗਣ. \uf03f\uf03e\uf03e, \uf03f\uf03e\uf03e.#"), "ਦੋ ਯਗਣ. ।ऽऽ, ।ऽऽ.#")


class Unresolved(unittest.TestCase):
    def test_unverified_code_point_is_left_alone(self):
        s = "ਫ਼ਾ. ਜ\uf030ਦ੍ਕ ਕੋਸ਼."
        self.assertEqual(clean_pua(s), s)
        self.assertEqual(find_pua(clean_pua(s)), ["\uf030"])

    def test_mark_with_no_target_letter_is_left_alone(self):
        # No ਸ in the cluster before the ष-dot: nothing to attach it to.
        s = "ਕਰ\uf032"
        self.assertEqual(clean_pua(s), s)

    def test_clean_text_is_untouched(self):
        s = "ਸੰਗ੍ਯਾ- ਜਲ. \"ਪਾਣੀ ਅੰਦਿਰ ਲੀਕ ਜਿਉ.\" (ਵਾਰ ਆਸਾ ਮਃ ੨)"
        self.assertEqual(clean_pua(s), s)
        self.assertEqual(find_pua(s), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
