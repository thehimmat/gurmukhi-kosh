#!/usr/bin/env python3
"""Tests for the Mahan Kosh normalize stage (issue #150).

Run from the project root:
  python3 pipeline/mahan-kosh/test_normalize.py
"""

import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from normalize import normalize_entry, run_normalize  # noqa: E402

SSA = chr(0xF032)  # ष-dot
UNKNOWN = chr(0xF030)  # unresolved

FOUND = {
    "gurmukhi": "ਹਰਿ",
    "found": True,
    "entry_gurmukhi": "ਹਰਿ",
    "mk_id": 1,
    "source_url": "https://example.test/ਹਰਿ",
    "senses": [
        {"sense_number": 1, "definition_text": f"ਵਿਸ{SSA}ਨੁ. ਕ੍ਰਿਸ{SSA}ਨ", "cross_refs": None},
        {"sense_number": 2, "definition_text": "ਹਰਾ ਰੰਗ.", "cross_refs": {"origin_lang": "sa"}},
    ],
}


class NormalizeEntry(unittest.TestCase):
    def test_cleans_every_sense(self):
        out = normalize_entry(FOUND)
        texts = [s["definition_text"] for s in out["senses"]]
        self.assertEqual(texts[0], "ਵਿਸ਼ਨੁ. ਕ੍ਰਿਸ਼ਨ")
        self.assertEqual(texts[1], "ਹਰਾ ਰੰਗ.")

    def test_keeps_other_fields_and_does_not_mutate_input(self):
        before = json.dumps(FOUND, ensure_ascii=False)
        out = normalize_entry(FOUND)
        self.assertEqual(json.dumps(FOUND, ensure_ascii=False), before)
        self.assertEqual(out["mk_id"], 1)
        self.assertEqual(out["senses"][1]["cross_refs"], {"origin_lang": "sa"})

    def test_not_found_entry_passes_through(self):
        e = {"gurmukhi": "ਕਖ", "found": False}
        self.assertEqual(normalize_entry(e), e)


class RunNormalize(unittest.TestCase):
    def test_writes_every_line_and_reports_counts(self):
        with tempfile.TemporaryDirectory() as d:
            src, dst = os.path.join(d, "entries.jsonl"), os.path.join(d, "normalized.jsonl")
            leftover = dict(FOUND, gurmukhi="ਕੋਸ", senses=[
                {"sense_number": 12, "definition_text": f"ਫ਼ਾ. ਜ{UNKNOWN}ਦ੍ਕ", "cross_refs": None},
            ])
            with open(src, "w", encoding="utf-8") as f:
                for e in (FOUND, {"gurmukhi": "ਕਖ", "found": False}, leftover):
                    f.write(json.dumps(e, ensure_ascii=False) + "\n")
                f.write("not json\n")

            stats = run_normalize(src, dst)

            with open(dst, encoding="utf-8") as f:
                lines = [json.loads(l) for l in f]
            self.assertEqual(len(lines), 3)
            self.assertNotIn(SSA, lines[0]["senses"][0]["definition_text"])
            self.assertEqual(stats["mapped"]["U+F032"], 2)
            self.assertEqual(stats["left"]["U+F030"], 1)
            self.assertEqual(stats["left_examples"]["U+F030"], ["ਕੋਸ#12"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
