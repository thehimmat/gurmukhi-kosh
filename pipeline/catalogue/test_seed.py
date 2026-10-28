#!/usr/bin/env python3
"""Tests for seeding the catalogue from the Anandpur workbook, manifest.yaml and the
Drive inventory.

Run from the project root:
  python3 pipeline/catalogue/test_seed.py
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from schema import validate  # noqa: E402
from seed import (  # noqa: E402
    add_drive_files, drive_id_from_url, from_anandpur, inventory_work_title, map_type,
    norm_title, split_label, split_list, type_from_filename,
)

OVERVIEW = [
    {"no": 3, "source": "Anandpur library — Padam 1976 (Darbari Ratan)", "printed": "Lav Kus Di Var",
     "best": "Lav Kus di Var", "authors": "Pandit Devi Das (Padam) · listed only as 'attributed' on bhainandlal.com",
     "summary": "Get Padam's Punjabi Varan.", "notes": None},
    {"no": 8, "source": "Anandpur library — Padam 1976 (Darbari Ratan)", "printed": "Karkhe Patshah Dasve Ke",
     "best": "Karkhe Patshah Dasvin Ke", "authors": "Sainapati", "summary": None, "notes": None},
    {"no": 9, "source": "Anandpur library — Padam 1976 (Darbari Ratan)", "printed": "Pandav Gita",
     "best": "Pandava Gita", "authors": "Kashi Ram", "summary": None, "notes": None},
]

PADAM = "https://archive.org/details/PunjabiVaran"
DOWNLOADS = [
    {"no": 3, "version": "Padam, Punjabi Varan (Singh Brothers, Amritsar, 2008 ed.), pp. 40–52",
     "type": "Anthology containing the text", "year": "2008", "editor": "Piara Singh Padam",
     "host": "Internet Archive", "availability": "Free download", "item_url": PADAM,
     "file_url": "https://archive.org/download/PunjabiVaran/PunjabiVaran.pdf", "link_check": "OK",
     "notes": "Prints the Lav Kus var.", "saved": "Saved",
     "drive_url": "https://drive.google.com/file/d/DRIVE_PADAM/view",
     "languages": "Panjabi, Braj/Bhakha", "scripts": "Gurmukhi", "machine_readable": None, "my_notes": None},
    {"no": 8, "version": "Padam, Punjabi Varan (Singh Brothers, Amritsar, 2008 ed.), pp. 60–61",
     "type": "Anthology containing the text", "year": "2008", "editor": "Piara Singh Padam",
     "host": "Internet Archive", "availability": "Free download", "item_url": PADAM,
     "file_url": "https://archive.org/download/PunjabiVaran/PunjabiVaran.pdf", "link_check": "OK",
     "notes": "Prints the Karkhe.", "saved": "Saved",
     "drive_url": "https://drive.google.com/file/d/DRIVE_PADAM/view",
     "languages": "Panjabi, Braj/Bhakha", "scripts": "Gurmukhi", "machine_readable": None, "my_notes": "check p. 61"},
    {"no": 9, "version": "MS 6, Dr. Dapinder Singh Collection, London", "type": "Catalogue record",
     "year": None, "editor": None, "host": "Private collection",
     "availability": "Catalogue record only (no scan)", "item_url": None, "file_url": None,
     "link_check": None, "notes": "No scan found.", "saved": "Not saved", "drive_url": None,
     "languages": "Braj/Bhakha", "scripts": "Gurmukhi", "machine_readable": None, "my_notes": None},
    {"no": 9, "version": "Pandava Gita, Gurmukhi MS (1886)", "type": "Manuscript scan",
     "year": "1886", "editor": None, "host": "Internet Archive", "availability": "Free download",
     "item_url": "https://archive.org/details/pandav_gita", "file_url": None, "link_check": "OK",
     "notes": None, "saved": "Not saved", "drive_url": None,
     "languages": "Braj/Bhakha", "scripts": "Gurmukhi", "machine_readable": None, "my_notes": None},
]


class Helpers(unittest.TestCase):
    def test_split_label_moves_page_locator_out(self):
        self.assertEqual(split_label("Padam, Darbari Ratan (Patiala, 1976), pp. 88–91 (Devi Das; at p. 89)"),
                         ("Padam, Darbari Ratan (Patiala, 1976)", "pp. 88–91 (Devi Das; at p. 89)"))
        self.assertEqual(split_label("MS 1, Dapinder Singh Collection"), ("MS 1, Dapinder Singh Collection", None))

    def test_split_list(self):
        self.assertEqual(split_list("Panjabi, Braj/Bhakha"), ["Panjabi", "Braj/Bhakha"])
        self.assertEqual(split_list(None), [])

    def test_drive_id_from_url(self):
        self.assertEqual(drive_id_from_url("https://drive.google.com/file/d/1lvnJw1L/view"), "1lvnJw1L")
        self.assertEqual(drive_id_from_url("https://drive.google.com/open?id=abc_D-9"), "abc_D-9")
        self.assertIsNone(drive_id_from_url(None))

    def test_map_type(self):
        self.assertEqual(map_type("Manuscript scan", "x"), "manuscript")
        self.assertEqual(map_type("Early print (pre-1947)", "Japji, lithograph, Lahore 1876"), "lithograph")
        self.assertEqual(map_type("Early print (pre-1947)", "Japji, Lahore 1903"), "early-print")
        self.assertEqual(map_type("Critical / scholarly edition", "x"), "edition")
        self.assertEqual(map_type("Anthology containing the text", "x"), "anthology")
        self.assertEqual(map_type("Catalogue record", "x"), "catalogue-record")

    def test_inventory_work_title(self):
        self.assertEqual(inventory_work_title(
            "MS - Kartik Mahatmya (Skanda Padma tradition), Gurmukhi MS, Kurukshetra Uni.pdf"), "Kartik Mahatmya")
        self.assertEqual(inventory_work_title("Sarbloh Granth - bir dated 1878 CE, 1003 pp..pdf"), "Sarbloh Granth")
        self.assertEqual(inventory_work_title("ZINDGINAMA.pdf"), "ZINDGINAMA")
        self.assertEqual(inventory_work_title("Source - Gitasara-muktipada, Sanskrit MS.pdf"), "Gitasara-muktipada")
        self.assertEqual(inventory_work_title("Vichar Sagar: The Ocean of Inquiry, chapter one"), "Vichar Sagar")

    def test_type_from_filename(self):
        self.assertEqual(type_from_filename("MS - Rajniti.pdf"), "manuscript")
        self.assertEqual(type_from_filename("Catalogue - Ashok, Suchi (1963).pdf"), "reference")
        self.assertIsNone(type_from_filename("Source - Gitasara, Sanskrit MS.pdf"))
        self.assertIsNone(type_from_filename("Sarbloh Granth - bir.pdf"))

    def test_norm_title_matches_spelling_variants(self):
        self.assertEqual(norm_title("Zafarnama & Hikayat"), norm_title("Zafarnama and Hikayat"))
        self.assertEqual(norm_title("Vārāṅ Bhai Gurdas Ji"), norm_title("Vaaran Bhai Gurdas"))
        self.assertNotEqual(norm_title("Gurbilas Patshahi 6"), norm_title("Gurbilas Patshahi 10"))


class FromAnandpur(unittest.TestCase):
    def setUp(self):
        self.cat = from_anandpur(OVERVIEW, DOWNLOADS, found_on="2026-10-08")

    def test_valid(self):
        self.assertEqual(validate(self.cat), [])

    def test_one_work_per_overview_row(self):
        w = {w["refs"]["anandpur"]: w for w in self.cat["works"]}
        self.assertEqual(sorted(w), [3, 8, 9])
        self.assertEqual(w[8]["title"]["roman"], "Karkhe Patshah Dasvin Ke")
        self.assertIn("Karkhe Patshah Dasve Ke", w[8]["title"]["variants"])
        self.assertEqual(w[3]["authors"][1]["name"], "listed only as 'attributed' on bhainandlal.com")
        self.assertEqual(w[3]["status"], "catalogued")

    def test_shared_anthology_is_one_version_with_both_works(self):
        padam = [v for v in self.cat["versions"] if v.get("drive_id") == "DRIVE_PADAM"]
        self.assertEqual(len(padam), 1)
        v = padam[0]
        self.assertEqual(v["label"], "Padam, Punjabi Varan (Singh Brothers, Amritsar, 2008 ed.)")
        self.assertEqual([c["locator"] for c in v["contains"]], ["pp. 40–52", "pp. 60–61"])
        self.assertEqual(v["status"], "in-drive")
        self.assertEqual(v["type"], "anthology")
        self.assertEqual(v["date"]["from"], 2008)
        self.assertEqual(v["languages"], ["Panjabi", "Braj/Bhakha"])
        self.assertIn("check p. 61", v["user_notes"])

    def test_not_saved_statuses(self):
        by_label = {v["label"]: v for v in self.cat["versions"]}
        self.assertEqual(by_label["MS 6, Dr. Dapinder Singh Collection, London"]["status"], "catalogue-only")
        ms = by_label["Pandava Gita, Gurmukhi MS (1886)"]
        self.assertEqual((ms["status"], ms["type"], ms["availability"]), ("available", "manuscript", "free-download"))


INVENTORY = [
    {"drive_id": "DRIVE_PADAM", "title": "Anthology - Padam, Punjabi Varan.pdf", "folder": "06 Sikhi & Gurbani / A",
     "pages": 412, "kind": "print", "text_layer": "none", "scripts": {}},
    {"drive_id": "D_SARB_1", "title": "Sarbloh Granth - bir dated 1878 CE, 1003 pp..pdf",
     "folder": "06 Sikhi & Gurbani / Texts / Sarbloh Granth", "pages": 1003, "kind": "manuscript",
     "text_layer": "none", "scripts": {}},
    {"drive_id": "D_SARB_2", "title": "Sarbloh Granth - Manglacharan.pdf",
     "folder": "06 Sikhi & Gurbani / Texts / Sarbloh Granth", "pages": None, "kind": "print",
     "text_layer": "unicode", "scripts": {"gurmukhi": 0.9}},
    {"drive_id": "D_PANDAV", "title": "Early print - Pandava Gita, Lahore (1903).pdf",
     "folder": "06 Sikhi & Gurbani / A", "pages": 88, "kind": "print", "text_layer": "none", "scripts": {}},
    {"drive_id": "D_GHAZAL", "title": "Ghazals Bhai Nand Laal Goyaa Complete.pdf", "folder": "06 Sikhi & Gurbani / NL",
     "pages": None, "kind": "print", "text_layer": "legacy", "scripts": {}},
]
MANIFEST = [
    {"drive_id": "D_GHAZAL", "file": "Ghazals Bhai Nand Laal Goyaa Complete.pdf", "pages": 71,
     "title": {"gurmukhi": "ਭਾਈ ਨੰਦ ਲਾਲ ਗੋਇਆ ਗ਼ਜ਼ਲਾਂ", "english": "Ghazals of Bhai Nand Lal Goya (complete)"},
     "author": "Bhai Nand Lal Goya", "year": "unknown", "languages": ["persian-in-gurmukhi"],
     "publisher": "none (self-typed document)", "editor_or_commentator": "unknown"},
]
IN_MY_DRIVE = [
    {"no": 9, "match": "definite", "file": "Early print - Pandava Gita, Lahore (1903).pdf", "note": "same text"},
    {"no": 8, "match": "related", "file": "Ghazals Bhai Nand Laal Goyaa Complete.pdf", "note": "unrelated"},
]


class MergeByFile(unittest.TestCase):
    def test_saved_and_unsaved_rows_of_the_same_file_merge(self):
        rows = [dict(DOWNLOADS[0]), dict(DOWNLOADS[1], saved="Not saved", drive_url=None,
                                         version="Padam, Punjabi Varan (Amritsar 2008), pp. 60–61")]
        cat = from_anandpur(OVERVIEW, rows, found_on="2026-10-08")
        self.assertEqual(len(cat["versions"]), 1)
        self.assertEqual(cat["versions"][0]["status"], "in-drive")
        self.assertEqual(len(cat["versions"][0]["contains"]), 2)

    def test_unsaved_first_then_saved_upgrades_to_in_drive(self):
        rows = [dict(DOWNLOADS[1], saved="Not saved", drive_url=None), dict(DOWNLOADS[0])]
        v = from_anandpur(OVERVIEW, rows, found_on="2026-10-08")["versions"]
        self.assertEqual(len(v), 1)
        self.assertEqual((v[0]["status"], v[0]["drive_id"]), ("in-drive", "DRIVE_PADAM"))

    def test_same_item_page_different_files_stay_apart(self):
        rows = [dict(DOWNLOADS[0], saved="Not saved", drive_url=None),
                dict(DOWNLOADS[1], saved="Not saved", drive_url=None, file_url="https://archive.org/download/PunjabiVaran/vol2.pdf")]
        self.assertEqual(len(from_anandpur(OVERVIEW, rows, found_on="2026-10-08")["versions"]), 2)


class AddDriveFiles(unittest.TestCase):
    def setUp(self):
        self.cat = from_anandpur(OVERVIEW, DOWNLOADS, found_on="2026-10-08")
        add_drive_files(self.cat, INVENTORY, MANIFEST, IN_MY_DRIVE)
        self.by_drive = {v["drive_id"]: v for v in self.cat["versions"] if v.get("drive_id")}
        self.works = {w["id"]: w for w in self.cat["works"]}

    def test_valid(self):
        self.assertEqual(validate(self.cat), [])

    def test_every_inventory_file_is_a_version(self):
        self.assertEqual(set(self.by_drive), {i["drive_id"] for i in INVENTORY})

    def test_existing_version_gets_pages_and_folder(self):
        v = self.by_drive["DRIVE_PADAM"]
        self.assertEqual((v["pages"], v["drive_folder"]), (412, "06 Sikhi & Gurbani / A"))
        self.assertEqual(len(v["contains"]), 2)  # untouched

    def test_in_my_drive_definite_match_links_existing_work(self):
        v = self.by_drive["D_PANDAV"]
        self.assertEqual([self.works[c["work_id"]]["refs"]["anandpur"] for c in v["contains"]], [9])
        self.assertEqual(v["type"], "early-print")

    def test_related_matches_are_not_linked(self):
        v = self.by_drive["D_GHAZAL"]
        self.assertNotIn(8, [self.works[c["work_id"]].get("refs", {}).get("anandpur") for c in v["contains"]])

    def test_unmatched_files_grouped_into_needs_curation_works(self):
        s1, s2 = self.by_drive["D_SARB_1"], self.by_drive["D_SARB_2"]
        self.assertEqual(s1["contains"], s2["contains"])
        work = self.works[s1["contains"][0]["work_id"]]
        self.assertEqual((work["title"]["roman"], work["status"]), ("Sarbloh Granth", "needs-curation"))
        self.assertEqual(s1["type"], "manuscript")
        self.assertEqual(s2["scripts"], ["Gurmukhi"])

    def test_manifest_supplies_titles_author_languages(self):
        v = self.by_drive["D_GHAZAL"]
        work = self.works[v["contains"][0]["work_id"]]
        self.assertEqual(work["title"]["gurmukhi"], "ਭਾਈ ਨੰਦ ਲਾਲ ਗੋਇਆ ਗ਼ਜ਼ਲਾਂ")
        self.assertEqual(work["authors"], [{"name": "Bhai Nand Lal Goya"}])
        self.assertEqual((v["pages"], v["languages"], v["scripts"]), (71, ["Persian"], ["Gurmukhi"]))
        self.assertNotIn("date", v)  # "unknown" is not a date

    def test_idempotent(self):
        before = len(self.cat["versions"]), len(self.cat["works"])
        add_drive_files(self.cat, INVENTORY, MANIFEST, IN_MY_DRIVE)
        self.assertEqual((len(self.cat["versions"]), len(self.cat["works"])), before)


if __name__ == "__main__":
    unittest.main()
