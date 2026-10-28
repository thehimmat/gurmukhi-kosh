#!/usr/bin/env python3
"""Tests for picking each day's sweep slice and wanted works.

Run from the project root:
  python3 pipeline/catalogue/test_sweep_plan.py
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sweep_plan import SLICES, plan  # noqa: E402

CAT = {"version": 1, "works": [{"id": f"w-{i}", "title": {"roman": f"W{i}"}, "status": "catalogued"}
                               for i in range(12)], "versions": []}


class Plan(unittest.TestCase):
    def test_slices_rotate_daily_and_cover_all(self):
        seen = [plan(CAT, f"2026-11-{d:02d}")["slice"]["key"] for d in range(1, 8)]
        self.assertEqual(sorted(seen), sorted(s["key"] for s in SLICES))

    def test_same_date_same_plan(self):
        self.assertEqual(plan(CAT, "2026-11-03"), plan(CAT, "2026-11-03"))

    def test_wanted_window_advances_and_wraps(self):
        a = plan(CAT, "2026-10-29")["wanted"]
        b = plan(CAT, "2026-10-30")["wanted"]
        c = plan(CAT, "2026-10-31")["wanted"]
        self.assertEqual([w["id"] for w in a], ["w-0", "w-1", "w-2", "w-3", "w-4"])
        self.assertEqual([w["id"] for w in b], ["w-5", "w-6", "w-7", "w-8", "w-9"])
        self.assertEqual([w["id"] for w in c], ["w-10", "w-11", "w-0", "w-1", "w-2"])

    def test_no_wanted_works(self):
        self.assertEqual(plan({"version": 1, "works": [], "versions": []}, "2026-10-29")["wanted"], [])


if __name__ == "__main__":
    unittest.main()
