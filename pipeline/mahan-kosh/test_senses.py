#!/usr/bin/env python3
"""Tests for splitting inline-numbered Mahan Kosh senses (issue #140).

Fixtures are real `definitions` rows (or close excerpts), except the two
marked SYNTHETIC, which pin the list-vs-sense rules on a minimal case.

Run from the project root:
  python3 pipeline/mahan-kosh/test_senses.py
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from senses import split_entry_senses  # noqa: E402


def sense(n, text):
    return {"sense_number": n, "definition_text": text, "cross_refs": None}


def split(headword, *senses, overrides=()):
    out, report = split_entry_senses(headword, list(senses), overrides=list(overrides))
    return out, report


def numbers(out):
    return [s["sense_number"] for s in out]


def texts(out):
    return [s["definition_text"] for s in out]


class SplitsAtSenseBoundaries(unittest.TestCase):
    def test_haumai_after_a_citation(self):
        out, _ = split("ਹਉਮੈ", sense(1,
            'ਸੰਗ੍ਯਾ- ਅਹੰ- ਮਮ. ਖ਼ੁਦੀ. "ਤਿਨਿ ਅੰਤਰਿ ਹਉਮੈ ਕੰਡਾ ਹੇ." (ਸੋਹਿਲਾ) ੨. ਦੇਖੋ, ਹਉਮੈ ਗਾਵਿਨ.'))
        self.assertEqual(numbers(out), [1, 2])
        self.assertEqual(texts(out), [
            'ਸੰਗ੍ਯਾ- ਅਹੰ- ਮਮ. ਖ਼ੁਦੀ. "ਤਿਨਿ ਅੰਤਰਿ ਹਉਮੈ ਕੰਡਾ ਹੇ." (ਸੋਹਿਲਾ)',
            "ਦੇਖੋ, ਹਉਮੈ ਗਾਵਿਨ.",
        ])

    def test_split_senses_are_marked_reversible(self):
        out, _ = split("ਹਉਮੈ", sense(1, 'ਖ਼ੁਦੀ. "ਹਉਮੈ ਕੰਡਾ ਹੇ." (ਸੋਹਿਲਾ) ੨. ਦੇਖੋ, ਹਉਮੈ ਗਾਵਿਨ.'))
        self.assertNotIn("split_from", out[0])
        self.assertEqual(out[1]["split_from"], 1)

    def test_gurmukhi_rows_interleave_with_existing_rows(self):
        out, _ = split(
            "ਗੁਰਮੁਖਿ",
            sense(1, 'ਗੁਰੂ ਦੇ ਮੁਖ ਵਿੱਚ. "ਗੁਰਮੁਖਿ ਨਾਦੰ ਗੁਰਮੁਖਿ ਵੇਦੰ." (ਜਪੁ) ੨. ਗੁਰਮੁਖਤਾ ਕਰਕੇ. '
                     '"ਗੁਰਮੁਖਿ ਮਿਲੀਐ ਮਨਮੁਖਿ ਵਿਛੁਰੈ." (ਮਾਝ ਅਃ ਮਃ ੫) ੩. ਦੇਖੋ, ਗੁਰਮੁਖੀ'),
            sense(4, 'ਦੇਖੋ, ਗੁਰਮੁਖ. "ਗੁਰਮੁਖਿ ਮੁਕਤਾ ਗੁਰਮੁਖਿ ਜੁਗਤਾ." (ਮਾਝ ਅਃ ਮਃ ੫) ੫. ਪ੍ਰਧਾਨ ਗੁਰੂ ਨੇ.'),
            sense(6, "ਗੁਰੂ ਦੀ ਸਿੱਖਿਆ ਵਾਲਾ."),
        )
        self.assertEqual(numbers(out), [1, 2, 3, 4, 5, 6])
        self.assertEqual(out[2]["definition_text"], "ਦੇਖੋ, ਗੁਰਮੁਖੀ")
        self.assertEqual(out[4]["split_from"], 4)

    def test_hari_hash_and_bare_word_boundaries(self):
        out, _ = split(
            "ਹਰਿ",
            sense(1, 'ਵਿ- ਹਰ਼ਿਤ (ਹਰਾ) ਦਾ ਸੰਖੇਪ. "ਦਾਵਾ ਅਗਨਿ ਰਹੇ ਹਰਿ ਬੂਟ." (ਰਾਮ ਅਃ ਮਃ ੫) ਹਰੇ ਬੂਟੇ।#੨. ਹਰਇੱਕ. '
                     '"ਹਰਿ ਭਾਵੈ ਹਰਿ ਨਿਸਤਾਰੇ." (ਗੂਜ ਮਃ ੪) ੩. ਕਿਰ. ਵਿ- ਹਰਕੇ. ੪. ਸੰ. ਸੰਗ੍ਯਾ- ਵਿਸਨੁ. '
                     "੫. ਕ੍ਰਿਸਨ ਜੀ ੬. ਪੌਂਡਕ ਵਾਸੁਦੇਵ."),
            sense(7, 'ਕਰਤਾਰ. "ਹਰਿ ਸੋ ਮੁਖ ਹੈ." (ਚੰਡੀ ੧) ੮. ਚੰਦ੍ਰਮਾ.'),
        )
        self.assertEqual(numbers(out), [1, 2, 3, 4, 5, 6, 7, 8])
        self.assertEqual(out[0]["definition_text"].split("ਹਰੇ ")[-1], "ਬੂਟੇ।")  # '#' dropped
        self.assertEqual(out[4]["definition_text"], "ਕ੍ਰਿਸਨ ਜੀ")
        self.assertEqual(out[5]["definition_text"], "ਪੌਂਡਕ ਵਾਸੁਦੇਵ.")

    def test_bare_word_boundary_outside_a_citation(self):
        out, _ = split("ਵਾਸਵ", sense(1, "ਵਿ- ਵਸੁ ਦੇਵਤਿਆਂ ਦਾ ੨. ਸੰਗ੍ਯਾ- ਇੰਦ੍ਰ."))
        self.assertEqual(numbers(out), [1, 2])


class LeavesOtherNumeralsAlone(unittest.TestCase):
    def assertUnchanged(self, headword, *senses):
        out, _ = split(headword, *senses)
        self.assertEqual(texts(out), [s["definition_text"] for s in senses])
        self.assertEqual(numbers(out), [s["sense_number"] for s in senses])

    def test_number_inside_a_citation(self):
        out, _ = split("ਹੁਕਮਾਵੈ", sense(1,
            'ਹੁਕਮ ਵਿੱਚ. "ਗੁਰੁ ਕੇ ਹੁਕਮਾਵੈ." (ਵਾਰ ਰਾਮ ੨. ਮਃ ੫) ੨. ਹੁਕਮ- ਆਵੈ.'))
        self.assertEqual(numbers(out), [1, 2])
        self.assertEqual(out[0]["definition_text"], 'ਹੁਕਮ ਵਿੱਚ. "ਗੁਰੁ ਕੇ ਹੁਕਮਾਵੈ." (ਵਾਰ ਰਾਮ ੨. ਮਃ ੫)')

    def test_verse_tally_and_prose_numbers(self):
        self.assertUnchanged("ਕੋਸ", sense(1, 'ਚਾਰ ਮੀਲ. "ਕੋਸ ਕੋਸ ਚਲਿ ਆਏ ॥੨॥" ਇਹ ਨਗਰ ੩੭ ਮੀਲ ਹੈ.'))

    def test_dates_and_sequence_breaks(self):
        # ਮੰਡੀ: "੧. ਨਵੰਬਰ" and "੧੯. ਅਗਸਤ" are dates, not senses.
        self.assertUnchanged(
            "ਮੰਡੀ",
            sense(1, "ਮੰਡੀ ਦਾ ਨੰਬਰ ਪੰਜਾਬ ਵਿੱਚ ਛੇਵਾਂ¹ ਹੈ. ੧. ਨਵੰਬਰ ਸਨ ੧੯੨੧ ਤੋਂ ਇਸ ਦਾ ਸੰਬੰਧ ਹੈ. "
                     "ਜਿਨ੍ਹਾਂ ਦਾ ਜਨਮ ੧੯. ਅਗਸਤ ਸਨ ੧੯੦੪ ਨੂੰ ਹੋਇਆ ਹੈ."),
            sense(2, "ਮੰਡਿਆਲ."),
            sense(3, "ਮੰਡਲ."),
        )

    def test_cross_reference_sense_number(self):
        # ਬਾਹਰੁ: "ਦੇਖੋ, ਬਾਹਰ ੩." points at sense 3 of ਬਾਹਰ; the quote after it
        # still belongs to sense 2.
        out, _ = split("ਬਾਹਰੁ", sense(1,
            'ਸੰਗ੍ਯਾ- ਬਾਹਰ ਦਾ ਭਾਗ. "ਬਾਹਰੁ ਉਦਕਿ ਪਖਾਰੀਐ." (ਗਉ ਰਵਿਦਾਸ) ੨. ਦੇਖੋ, ਬਾਹਰ ੩. '
            '"ਬਾਹਰੁ ਖੋਜਿ ਮੁਏ ਸਭਿ ਸਾਕਤ." (ਬਸੰ ਅਃ ਮਃ ੪)'))
        self.assertEqual(numbers(out), [1, 2])
        self.assertEqual(out[1]["definition_text"],
                         'ਦੇਖੋ, ਬਾਹਰ ੩. "ਬਾਹਰੁ ਖੋਜਿ ਮੁਏ ਸਭਿ ਸਾਕਤ." (ਬਸੰ ਅਃ ਮਃ ੪)')

    def test_real_sense_after_a_cross_reference_number(self):
        # ਪੰਥੁ: the xref's "੨." comes first; the printed sense ੨ follows.
        out, _ = split("ਪੰਥੁ",
            sense(1, 'ਦੇਖੋ, ਪੰਥ ੨. "ਪੰਥੁ ਨਿਹਾਰੈ ਕਾਮਨੀ." (ਗਉ ਕਬੀਰ) ੨. ਸੰ. ਪਾਂਥ. ਮੁਸਾਫ਼ਿਰ.'),
            sense(3, "ਦੇਖੋ, ਪੰਥ."))
        self.assertEqual(numbers(out), [1, 2, 3])
        self.assertEqual(out[1]["definition_text"], "ਸੰ. ਪਾਂਥ. ਮੁਸਾਫ਼ਿਰ.")

    def test_number_reference(self):
        # ਭਾਖੀ: "ਨੰ. ੧." is "No. 1", a reference to sense 1.
        self.assertUnchanged("ਭਾਖੀ", sense(4, "ਪੋਠੋਹਾਰ ਵਿੱਚ ਜਾਣਨਾ ਹੈ. ਇਸ ਅਨੁਸਾਰ ਨੰ. ੧. ਦੇ ਉਦਾਹਰਣ ਦਾ ਅਰਥ ਹੋਊ."))


class NumberedListsStayInline(unittest.TestCase):
    def test_list_items_that_collide_with_the_next_sense(self):
        # ਸੁੰਨੀ sense 2 lists four imams; item ੩ could be sense 3 by number.
        out, report = split("ਸੁੰਨੀ", sense(1, "ਸੁੰਨਤ ਵਾਲਾ."), sense(2,
            "ਸੁੰਨੀਆਂ ਦੇ ਚਾਰ ਇਮਾਮ ਪ੍ਰਸਿੱਧ ਹੋਏ ਹਨ-#੧. ਅਬੂਹਨੀਫ਼ਾ. ਕੂਫਾ ਨਗਰ ਵਿੱਚ ਜਨਮਿਆ.#੨. ਸ਼ਾਫ਼ੀ. "
            "ਮਿਸਰ ਵਿੱਚ ਮੋਇਆ.#੩. ਮਾਲਿਕ. ਮਦੀਨੇ ਵਿੱਚ ਜਨਮਿਆ.#੪. ਅਹਮਦ ਇਬਨ ਹੰਬਲ. ਬਗਦਾਦ ਵਿੱਚ ਜਨਮਿਆ."))
        self.assertEqual(numbers(out), [1, 2])
        self.assertIn("#੩. ਮਾਲਿਕ", out[1]["definition_text"])
        self.assertIn("ambiguous_list_item", [r["kind"] for r in report])

    def test_verse_lines_of_a_quoted_shabad(self):
        out, _ = split("ਫੀਲੁ", sense(2,
            "ਆਸਾ ਰਾਗ ਵਿੱਚ ਕਬੀਰ ਜੀ ਦਾ ਸ਼ਬਦ ਹੈ-#੧. ਫੀਲੁ ਰਬਾਬੀ ਬਲਦੁ ਪਖਾਵਜ ਕਊਆ ਤਾਲ ਬਜਾਵੈ,"
            "#੨. ਪਹਿਰਿ ਚੋਲਨਾ ਗਦਹਾ ਨਾਚੈ ਭੈਸਾ ਭਗਤਿ ਕਰਾਵੈ,#੩. ਰਾਜਾ ਰਾਮ ਕਕਰੀ ਆਬਰੇ ਪਕਾਏ,"
            "#੫. ਬੈਠਿ ਸਿੰਘੁ ਘਰਿ ਪਾਨ ਲਗਾਵੈ,#੧. ਹਾਥੀ (ਮਦਮੱਤ) ਰਬਾਬੀ ਹੈ,#੨. ਗਧਾ ਨਾਚਦਾ ਹੈ,"
            "#੩. ਕਰਤਾਰ ਨੇ ਅੱਕ ਦੀ ਕੁਕੜੀਆਂ ਤੋੜੀਆਂ."))
        self.assertEqual(numbers(out), [2])

    def test_list_number_taken_by_an_existing_row(self):
        # Next-row check: sense 2 already exists, so ੨ here cannot be a sense
        # even though it opens like one.
        out, _ = split("ਨਮੂਨਾ",
            sense(1, "ਦੋ ਭੇਦ ਹਨ-#੧. ਸੰਗ੍ਯਾ- ਪਹਿਲਾ.#੨. ਸੰਗ੍ਯਾ- ਦੂਜਾ."),
            sense(2, "ਦੇਖੋ, ਨਮੂਨਾ."))
        self.assertEqual(numbers(out), [1, 2])
        self.assertIn("#੨. ਸੰਗ੍ਯਾ- ਦੂਜਾ", out[0]["definition_text"])

    def test_sense_after_numbered_quotations(self):
        # SYNTHETIC (the case raised on #140): sense 2 carries two numbered
        # quotations, then senses 3 and 4 follow. The quotations open with
        # '"'; sense 3 does not, so the shape change closes the list.
        out, _ = split("ਉਦਾਹਰਣ", sense(1,
            'ਪਹਿਲਾ ਅਰਥ. ੨. ਦੂਜਾ ਅਰਥ. ੧. "ਪਹਿਲੀ ਤੁਕ." (ਜਪੁ) ੨. "ਦੂਜੀ ਤੁਕ." (ਸੋਹਿਲਾ) '
            "੩. ਤੀਜਾ ਅਰਥ. ੪. ਚੌਥਾ ਅਰਥ."))
        self.assertEqual(numbers(out), [1, 2, 3, 4])
        self.assertEqual(out[1]["definition_text"],
                         'ਦੂਜਾ ਅਰਥ. ੧. "ਪਹਿਲੀ ਤੁਕ." (ਜਪੁ) ੨. "ਦੂਜੀ ਤੁਕ." (ਸੋਹਿਲਾ)')
        self.assertEqual(out[2]["definition_text"], "ਤੀਜਾ ਅਰਥ.")

    def test_head_marker_closes_a_list(self):
        # SYNTHETIC: list items and the next sense share the '#' separator;
        # the sense opens with a POS marker, the items do not.
        out, _ = split("ਨਾਉ", sense(2,
            "ਦੋ ਨਾਉ ਹਨ-#੧. ਰਾਮ.#੨. ਹਰਿ.#੩. ਸੰਗ੍ਯਾ- ਨਾਮ. ਸੰਗ੍ਯਾ."))
        self.assertEqual(numbers(out), [2, 3])
        self.assertEqual(out[1]["definition_text"], "ਸੰਗ੍ਯਾ- ਨਾਮ. ਸੰਗ੍ਯਾ.")


class Overrides(unittest.TestCase):
    def test_broken_numeral_split_by_override(self):
        # ਧਰਮ: "੧. ਧਨੁਸ" is sense ੧੦ with a dropped digit (rows 9 and 11 exist).
        out, report = split(
            "ਧਰਮ",
            sense(9, 'ਧਰਮਰਾਜ. "ਅਨਿਕ ਧਰਮ ਅਨਿਕ ਕੁਮੇਰ." (ਸਾਰ ਅਃ ਮਃ ੫) ੧. ਧਨੁਸ. ਕਮਾਣ. ਚਾਪ'),
            sense(11, "ਸੁਭਾਉ."),
            overrides=[{"headword": "ਧਰਮ", "sense_number": 9, "at": "੧. ਧਨੁਸ", "split_as": 10}],
        )
        self.assertEqual(numbers(out), [9, 10, 11])
        self.assertEqual(out[1]["definition_text"], "ਧਨੁਸ. ਕਮਾਣ. ਚਾਪ")
        self.assertIn("override_split", [r["kind"] for r in report])

    def test_override_keep_blocks_a_split(self):
        out, _ = split(
            "ਹਉਮੈ",
            sense(1, 'ਖ਼ੁਦੀ. "ਹਉਮੈ ਕੰਡਾ ਹੇ." (ਸੋਹਿਲਾ) ੨. ਦੇਖੋ, ਹਉਮੈ ਗਾਵਿਨ.'),
            overrides=[{"headword": "ਹਉਮੈ", "sense_number": 1, "at": "੨. ਦੇਖੋ", "keep": True}],
        )
        self.assertEqual(numbers(out), [1])

    def test_out_of_sequence_numeral_is_reported(self):
        out, report = split("ਨਾਂਗਾ", sense(3, 'ਭੁੱਖਾ. "ਨਾਂਗਾ ਰਹੈ." (ਗਉ ਕਬੀਰ) ੫. ਉਪਵਾਸ. ਭੋਜਨ ਬਿਨਾ.'))
        self.assertEqual(numbers(out), [3])
        self.assertEqual([r["kind"] for r in report], ["out_of_sequence"])
        self.assertEqual(report[0]["headword"], "ਨਾਂਗਾ")
        self.assertEqual(report[0]["sense_number"], 3)


if __name__ == "__main__":
    unittest.main(verbosity=2)
