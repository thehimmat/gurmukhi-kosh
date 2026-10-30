#!/usr/bin/env python3
"""Tests for the Mahan Kosh scraper (scrape.py): API matching and retries, sense
splitting, cross-refs, checkpointing, and the record shape ingest.ts reads.

The API is mocked. Responses mirror the fields scrape.py reads from
backend.searchgurbani.com (`lines[].word`, `description`, `ID`); if the API
renames them, the scraper silently records every word as "no match", which is
what the lookup tests guard.

Run from the project root:
  python3 pipeline/mahan-kosh/test_scrape.py
"""

import json
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import scrape  # noqa: E402


class FakeResponse:
    def __init__(self, status=200, body=None):
        self.status_code = status
        self._body = body if body is not None else {}

    def json(self):
        return self._body

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


def api(*lines):
    return FakeResponse(200, {"lines": list(lines)})


def line(word, description="ਸੰ. ਸੰਗ੍ਯਾ- ਵਰ੍ਹਾ.", id_=1):
    return {"word": word, "description": description, "ID": id_}


class LookupWord(unittest.TestCase):
    def setUp(self):
        sleep = mock.patch.object(scrape.time, "sleep")
        sleep.start()
        self.addCleanup(sleep.stop)

    def lookup(self, word, *responses):
        with mock.patch.object(scrape.SESSION, "get", side_effect=list(responses)) as get:
            return scrape.lookup_word(word), get

    def test_exact_headword_wins_over_earlier_lines(self):
        hit, _ = self.lookup("ਨਾਨਕ", api(line("ਨਾਨਕੀ", id_=1), line("ਨਾਨਕ", id_=2)))
        self.assertEqual(hit["ID"], 2)

    def test_falls_back_to_trailing_vowel_match(self):
        hit, _ = self.lookup("ਨਾਨਕੁ", api(line("ਸਤਿ"), line("ਨਾਨਕ", id_=7)))
        self.assertEqual(hit["ID"], 7)

    def test_no_lines_is_no_match(self):
        hit, _ = self.lookup("ਨਾਨਕ", FakeResponse(200, {"lines": []}))
        self.assertIsNone(hit)
        hit, _ = self.lookup("ਨਾਨਕ", FakeResponse(200, {}))
        self.assertIsNone(hit)

    def test_unrelated_lines_are_no_match(self):
        hit, _ = self.lookup("ਨਾਨਕ", api(line("ਸਤਿ"), line("ਗੁਰ")))
        self.assertIsNone(hit)

    def test_queries_the_keyword_url_encoded(self):
        _, get = self.lookup("ਨਾਨਕ", api(line("ਨਾਨਕ")))
        url = get.call_args.args[0]
        self.assertTrue(url.startswith(scrape.MK_API_BASE + "?keyword=%E0%A8"))
        self.assertIn("&alpha=alpha&page=0", url)

    def test_retries_after_rate_limit(self):
        hit, get = self.lookup("ਨਾਨਕ", FakeResponse(429), FakeResponse(429), api(line("ਨਾਨਕ", id_=3)))
        self.assertEqual(hit["ID"], 3)
        self.assertEqual(get.call_count, 3)

    def test_persistent_rate_limit_raises_instead_of_no_match(self):
        with self.assertRaises(RuntimeError):
            self.lookup("ਨਾਨਕ", *[FakeResponse(429)] * 4)

    def test_server_error_raises_instead_of_no_match(self):
        # A transient failure recorded as found:false would never be retried.
        with self.assertRaises(RuntimeError):
            self.lookup("ਨਾਨਕ", FakeResponse(503))

    def test_network_error_raises_instead_of_no_match(self):
        with self.assertRaises(RuntimeError):
            self.lookup("ਨਾਨਕ", ConnectionError("reset"))


class ParseSenses(unittest.TestCase):
    def test_numbered_senses(self):
        senses = scrape.parse_senses("ਸੰ. ਸੰਗ੍ਯਾ- ਵਰ੍ਹਾ. ਸਾਲ। ੨. ਰੁੱਤ. ਮੌਸਮ। ੩. ਅੱਧਾ ਸਾਲ.")
        self.assertEqual([s["sense_number"] for s in senses], [1, 2, 3])
        self.assertEqual(senses[0]["definition_text"], "ਸੰ. ਸੰਗ੍ਯਾ- ਵਰ੍ਹਾ. ਸਾਲ")
        self.assertEqual(senses[2]["definition_text"], "ਅੱਧਾ ਸਾਲ.")

    def test_single_sense_drops_trailing_danda(self):
        senses = scrape.parse_senses("ਵਿ- ਸੱਚਾ।")
        self.assertEqual(senses, [{"sense_number": 1, "definition_text": "ਵਿ- ਸੱਚਾ", "cross_refs": None}])

    def test_multi_digit_sense_numbers(self):
        senses = scrape.parse_senses("ਪਹਿਲਾ। ੧੦. ਦਸਵਾਂ। ੧੧. ਗਿਆਰਵਾਂ")
        self.assertEqual([s["sense_number"] for s in senses], [1, 10, 11])

    def test_empty_description(self):
        self.assertEqual(scrape.parse_senses(""), [])
        self.assertEqual(scrape.parse_senses(None), [])


class CrossRefs(unittest.TestCase):
    def test_arabic_script_in_brackets(self):
        self.assertEqual(scrape.extract_cross_refs("ਅ਼. [سما] ਅਸਮਾਨ"), {"ar_fa": "سما", "origin_lang": "ar"})

    def test_gurmukhi_in_brackets_is_not_a_ref(self):
        self.assertIsNone(scrape.extract_cross_refs("ਦੇਖੋ [ਨਾਨਕ]"))

    def test_origin_markers(self):
        self.assertEqual(scrape.extract_cross_refs("ਸੰ. ਵਰ੍ਹਾ"), {"origin_lang": "sa"})
        self.assertEqual(scrape.extract_cross_refs("ਫ਼ਾ. ਦਿਲ"), {"origin_lang": "fa"})

    def test_non_markers_do_not_tag_an_origin(self):
        # #35: ਉ. is a list enumerator and ਦੇਸ਼. an ordinary noun, not origin markers.
        self.assertIsNone(scrape.extract_cross_refs("ਉ. ਪਹਿਲਾ ਦੇਸ਼. ਮੁਲਕ"))


class GurmukhiDigits(unittest.TestCase):
    def test_converts(self):
        self.assertEqual(scrape._gd_to_int("੧੨"), 12)
        self.assertEqual(scrape._gd_to_int("੯"), 9)


class Checkpoint(unittest.TestCase):
    def test_missing_file_is_empty(self):
        self.assertEqual(scrape.load_checkpoint("/nonexistent/entries.jsonl"), set())

    def test_reads_found_and_not_found_and_skips_corrupt_lines(self):
        with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False, encoding="utf-8") as f:
            f.write(json.dumps({"gurmukhi": "ਨਾਨਕ", "found": True}, ensure_ascii=False) + "\n")
            f.write("{truncated by a crash\n")
            f.write(json.dumps({"gurmukhi": "ਸਤਿ", "found": False}, ensure_ascii=False) + "\n")
        self.addCleanup(os.unlink, f.name)
        self.assertEqual(scrape.load_checkpoint(f.name), {"ਨਾਨਕ", "ਸਤਿ"})


class BuildRecord(unittest.TestCase):
    """The fields pipeline/mahan-kosh/ingest.ts reads from entries.jsonl."""

    def test_found(self):
        rec = scrape.build_record("ਨਾਨਕੁ", line("ਨਾਨਕ", "ਗੁਰੂ ਨਾਨਕ ਦੇਵ। ੨. ਨਾਨਾ", id_=42))
        self.assertEqual(rec["gurmukhi"], "ਨਾਨਕੁ")
        self.assertIs(rec["found"], True)
        self.assertEqual(rec["entry_gurmukhi"], "ਨਾਨਕ")
        self.assertEqual(rec["mk_id"], 42)
        self.assertEqual(rec["source_url"], "https://www.searchgurbani.com/mahan-kosh/view?word=%E0%A8%A8%E0%A8%BE%E0%A8%A8%E0%A8%95%E0%A9%81")
        self.assertEqual([s["sense_number"] for s in rec["senses"]], [1, 2])

    def test_no_entry(self):
        self.assertEqual(scrape.build_record("ਨਾਨਕ", None), {"gurmukhi": "ਨਾਨਕ", "found": False})

    def test_entry_without_description_is_not_found(self):
        self.assertEqual(scrape.build_record("ਨਾਨਕ", line("ਨਾਨਕ", "")), {"gurmukhi": "ਨਾਨਕ", "found": False})

    def test_serialises_unescaped(self):
        rec = scrape.build_record("ਨਾਨਕ", line("ਨਾਨਕ"))
        self.assertIn("ਨਾਨਕ", json.dumps(rec, ensure_ascii=False))


if __name__ == "__main__":
    unittest.main()
