#!/usr/bin/env python3
"""Tests for repairing repeated Mahan Kosh sense numbers (issue #159).

The scraper numbers senses from the printed numerals, and the source has
typos: a numeral repeated where the next one belongs (ਵੇਕਾਰ 1,2,2,4), one
that runs backwards (ਭਰ …7,8,4), and whole senses copied twice (ਕਲੇਸ).
Fixtures are the real rows from output/entries.jsonl.

Run from the project root:
  python3 pipeline/mahan-kosh/test_numbering.py
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from numbering import repair_numbering  # noqa: E402


def sense(n, text):
    return {"sense_number": n, "definition_text": text, "cross_refs": None}


def numbers(out):
    return [s["sense_number"] for s in out]


def kinds(notes):
    return [n["kind"] for n in notes]


class DropsCopiedSenses(unittest.TestCase):
    def test_whole_run_printed_twice(self):
        # ਕਲੇਸ: senses 2-5 appear twice, word for word.
        run = ["ਝਗੜਾ", "ਫ਼ਿਕਰ. ਚਿੰਤਾ", "ਕ੍ਰੋਧ", "ਵਿਦ੍ਵਾਨਾਂ ਨੇ ਪੰਜ ਕ੍ਲੇਸ਼ ਲਿਖੇ ਹਨ"]
        senses = [sense(1, "ਸੰ. ਸੰਗ੍ਯਾ- ਦੁੱਖ")] + [sense(i + 2, t) for i, t in enumerate(run)] * 2
        out, notes = repair_numbering("ਕਲੇਸ", senses)
        self.assertEqual(numbers(out), [1, 2, 3, 4, 5])
        self.assertEqual(kinds(notes), ["duplicate_text_dropped"] * 4)

    def test_copy_under_the_next_number(self):
        # ਗੰਧਰਬ: sense 5's text repeated as a "6", then the real 6.
        out, _ = repair_numbering("ਗੰਧਰਬ", [
            sense(4, "ਕੋਕਿਲਾ. ਕੋਇਲ"),
            sense(5, "ਸੰਗੀਤ ਅਨੁਸਾਰ ਤਾਲ ਦਾ ਇੱਕ ਭੇਦ"),
            sense(6, "ਸੰਗੀਤ ਅਨੁਸਾਰ ਤਾਲ ਦਾ ਇੱਕ ਭੇਦ"),
            sense(6, "ਵਿਧਵਾ ਇਸਤ੍ਰੀ ਦਾ ਦੂਜਾ ਪਤਿ"),
            sense(7, "ਘੋੜਾ"),
        ])
        self.assertEqual(numbers(out), [4, 5, 6, 7])
        self.assertEqual(out[2]["definition_text"], "ਵਿਧਵਾ ਇਸਤ੍ਰੀ ਦਾ ਦੂਜਾ ਪਤਿ")


class RenumbersByPosition(unittest.TestCase):
    def test_repeated_number_takes_the_free_next_one(self):
        out, notes = repair_numbering("ਵੇਕਾਰ", [
            sense(1, "ਵਿ- ਬੇ- ਕਾਰ. ਨਿਕੰਮਾ"),
            sense(2, "ਸੰ. ਵਿਕਾਰ ਸੰਗ੍ਯਾ-"),
            sense(2, "ਸੰ. ਵੈਕਾਰ੍ਰ ਵਿ- ਜਿਸ ਤੋਂ ਵੇਕਾਰ ਹੋ ਸਕਦਾ ਹੈ"),
            sense(4, "ਸੰਗ੍ਯਾ- ਵਿਕਾਰ ਦਾ ਭਾਵ."),
        ])
        self.assertEqual(numbers(out), [1, 2, 3, 4])
        self.assertEqual(out[2]["printed_number"], 2)
        self.assertNotIn("printed_number", out[1])
        self.assertEqual(kinds(notes), ["renumbered"])

    def test_number_that_runs_backwards(self):
        # ਭਰ: …7, 8, then a "4" that is really sense 9.
        senses = [sense(n, f"ਅਰਥ {n}") for n in (1, 3, 4, 5, 6, 7, 8)]
        senses.append(sense(4, 'ਕ੍ਰਿ. ਵਿ- ਪਰ੍ਯਂਤ. ਤੀਕ. "ਕੋਸ ਭਰ ਛੋਰ ਸਿਧਾਵਹੁ."'))
        out, _ = repair_numbering("ਭਰ", senses)
        self.assertEqual(numbers(out), [1, 3, 4, 5, 6, 7, 8, 9])
        self.assertEqual(out[-1]["printed_number"], 4)

    def test_repeat_before_a_gap(self):
        # ਕਲਾ: 5, 5, then 10 — the second 5 is sense 6.
        out, _ = repair_numbering("ਕਲਾ", [
            sense(4, "ਸੋਲਵਾਂ ਹਿੱਸਾ"),
            sense(5, "ਰਾਸ਼ੀ ਦੇ ਤੀਹਵੇਂ ਹਿੱਸੇ ਦਾ ਸੱਠਵਾਂ ਹਿੱਸਾ"),
            sense(5, "ਸ਼ਕਤਿ. (ਬਸੰ ਮਃ ੫) ੭. ਬਾਜ਼ੀ."),
            sense(10, "ਵਿਦ੍ਯਾ"),
        ])
        self.assertEqual(numbers(out), [4, 5, 6, 10])


class MergesWhenNoNumberIsFree(unittest.TestCase):
    def test_merges_into_the_previous_sense(self):
        out, notes = repair_numbering("ਨਮੂਨਾ", [
            sense(1, "ਪਹਿਲਾ."),
            sense(2, "ਦੂਜਾ."),
            sense(2, "ਦੂਜੇ ਦਾ ਵਾਧਾ."),
            sense(3, "ਤੀਜਾ."),
        ])
        self.assertEqual(numbers(out), [1, 2, 3])
        self.assertEqual(out[1]["definition_text"], "ਦੂਜਾ. ਦੂਜੇ ਦਾ ਵਾਧਾ.")
        self.assertEqual(kinds(notes), ["merged_no_room"])


class LeavesCleanEntriesAlone(unittest.TestCase):
    def test_increasing_numbers_with_gaps_are_untouched(self):
        senses = [sense(1, "ਇੱਕ"), sense(4, "ਚਾਰ"), sense(6, "ਛੇ")]
        out, notes = repair_numbering("ਸਾਫ਼", senses)
        self.assertEqual(out, senses)
        self.assertEqual(notes, [])

    def test_input_is_not_mutated(self):
        senses = [sense(1, "ਇੱਕ"), sense(1, "ਦੋ")]
        repair_numbering("ਸਾਫ਼", senses)
        self.assertEqual(numbers(senses), [1, 1])
        self.assertNotIn("printed_number", senses[1])


if __name__ == "__main__":
    unittest.main(verbosity=2)
