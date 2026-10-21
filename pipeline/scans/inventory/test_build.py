#!/usr/bin/env python3
"""Tests for assembling the Drive inventory.

Run from the project root:
  python3 pipeline/scans/inventory/test_build.py
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from build import build_rows, folder_path, guess_kind  # noqa: E402

TREE = {
    "root": {"id": "root", "parentId": "", "kind": "F", "title": "06 Sikhi & Gurbani"},
    "texts": {"id": "texts", "parentId": "root", "kind": "F", "title": "Texts & Granths"},
    "sarbloh": {"id": "sarbloh", "parentId": "texts", "kind": "F", "title": "Sarbloh Granth"},
    "early": {"id": "early", "parentId": "sarbloh", "kind": "F", "title": "Early witnesses"},
    "p1": {"id": "p1", "parentId": "early", "kind": "P", "size": 5_000_000,
           "title": "Sarbloh Granth - bir dated 1878 CE, 1003 pp..pdf"},
    "p2": {"id": "p2", "parentId": "sarbloh", "kind": "P", "size": 2_000_000,
           "title": "Sarbloh Granth Manglacharan.pdf"},
    "img": {"id": "img", "parentId": "sarbloh", "kind": "O", "size": 1, "title": "page1.jpg"},
}


class FolderPath(unittest.TestCase):
    def test_path_from_root(self):
        self.assertEqual(folder_path(TREE, "p1"), "06 Sikhi & Gurbani / Texts & Granths / Sarbloh Granth / Early witnesses")


class Kind(unittest.TestCase):
    def test_manuscripts(self):
        for title in ("Pandav Gita - Gurmukhi MS of Pandava Gita, 191 pp. (undated).pdf",
                      "Guru Granth Sahib (Ram Rai saroop) - Handwritten SGGS saroop.pdf",
                      "Sarbloh Granth - Sarbloh Granth bir dated 1878 CE.pdf",
                      "Pothi Bhai Mohan Ji - Panjab University MS no. 425.pdf"):
            self.assertEqual(guess_kind(title, ""), "manuscript", title)

    def test_lithographs(self):
        self.assertEqual(guess_kind("Das Granthi - Gurmukhi larivaar lithograph (stone print).pdf", ""), "lithograph")
        self.assertEqual(guess_kind("Janamsakhi Bhai Bala - water stone print 1823.pdf", ""), "lithograph")

    def test_compilations(self):
        for title in ("gutka sahib nitnem - 20-6-2019.pdf", "Nitnem Sahib Nangali Ji.pdf",
                      "Dushera Mahatam Pothi.pdf", "ਸੰਧਿਆ ਨਿਤਨੇਮ ਗੁਟਕਾ - ਸ਼ਹੀਦੀ ਬਾਗ.pdf"):
            self.assertEqual(guess_kind(title, ""), "compilation", title)

    def test_commentaries(self):
        for title in ("Sri Guru Granth Sahib Darpan - Prof Sahib Singh.pdf", "Fareedkot Teeka.pdf",
                      "Complete Sri Sarbloh Granth Sahib Ji Steek.pdf"):
            self.assertEqual(guess_kind(title, ""), "commentary", title)

    def test_default_is_print(self):
        self.assertEqual(guess_kind("Sarbloh Granth Manglacharan.pdf", ""), "print")


class Rows(unittest.TestCase):
    def test_one_row_per_pdf_with_probe_and_triage(self):
        probes = {"p1": {"text_layer": "none", "pages": 1003, "probe": "drive-text"}}
        manifest = {"p2": {"decision": "witness", "tier": "gurbani", "text_layer": "legacy-GurbaniAkhar"}}
        rows = build_rows(TREE, probes, manifest)
        self.assertEqual([r["drive_id"] for r in rows], ["p2", "p1"])  # by path, then title
        p1 = next(r for r in rows if r["drive_id"] == "p1")
        self.assertEqual(p1["text_layer"], "none")
        self.assertEqual(p1["pages"], 1003)
        self.assertEqual(p1["kind"], "manuscript")
        p2 = next(r for r in rows if r["drive_id"] == "p2")
        self.assertEqual(p2["text_layer"], "unprobed")
        self.assertEqual(p2["triage"], {"decision": "witness", "tier": "gurbani", "text_layer": "legacy-GurbaniAkhar"})

    def test_images_are_counted_per_folder_not_listed(self):
        rows = build_rows(TREE, {}, {})
        self.assertNotIn("img", [r["drive_id"] for r in rows])


if __name__ == "__main__":
    unittest.main()
