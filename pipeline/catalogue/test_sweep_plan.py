#!/usr/bin/env python3
"""Tests for picking each run's sweep slice and wanted works.

Run from the project root:
  python3 pipeline/catalogue/test_sweep_plan.py
"""

import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sweep_plan import SLICES, plan, runs_logged  # noqa: E402

CAT = {"version": 1, "works": [{"id": f"w-{i}", "title": {"roman": f"W{i}"}, "status": "catalogued"}
                               for i in range(12)], "versions": []}


class Plan(unittest.TestCase):
    def test_slices_rotate_per_run_and_cover_all(self):
        seen = [plan(CAT, "2026-11-02", run).get("slice")["key"] for run in range(len(SLICES))]
        self.assertEqual(sorted(seen), sorted(s["key"] for s in SLICES))

    def test_twice_weekly_runs_still_cover_every_slice(self):
        # Mon/Thu runs: the rotation follows the run count, not the date.
        days = ["2026-11-02", "2026-11-05", "2026-11-09", "2026-11-12", "2026-11-16", "2026-11-19", "2026-11-23"]
        seen = {plan(CAT, d, run)["slice"]["key"] for run, d in enumerate(days)}
        self.assertEqual(len(seen), len(SLICES))

    def test_same_run_same_plan(self):
        self.assertEqual(plan(CAT, "2026-11-03", 4), plan(CAT, "2026-11-03", 4))

    def test_wanted_window_advances_and_wraps(self):
        ids = lambda run: [w["id"] for w in plan(CAT, "2026-11-02", run)["wanted"]]  # noqa: E731
        self.assertEqual(ids(0), ["w-0", "w-1", "w-2", "w-3", "w-4"])
        self.assertEqual(ids(1), ["w-5", "w-6", "w-7", "w-8", "w-9"])
        self.assertEqual(ids(2), ["w-10", "w-11", "w-0", "w-1", "w-2"])

    def test_no_wanted_works(self):
        self.assertEqual(plan({"version": 1, "works": [], "versions": []}, "2026-10-29", 0)["wanted"], [])

    def test_runs_logged_counts_nonblank_lines(self):
        with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False) as f:
            f.write('{"date": "2026-10-28"}\n\n{"date": "2026-10-29"}\n')
        try:
            self.assertEqual(runs_logged(f.name), 2)
        finally:
            os.unlink(f.name)
        self.assertEqual(runs_logged("/nonexistent/sweeps.jsonl"), 0)


if __name__ == "__main__":
    unittest.main()
