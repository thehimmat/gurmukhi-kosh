// US-006: Flag errors and monitor data quality (active).
// Criteria: user-stories/US-006-flag-errors-and-monitor-data-quality.md
//
// The flag POSTs here are designed to never insert a row: the honeypot case
// is silently dropped by the server, and the validation case fails before the
// insert. Prod data stays clean.

import { describe, it, expect } from "vitest";
import { PROD_BASE } from "./helpers";

describe("US-006: flagging and data-quality monitoring", () => {
  it("US-006: a bot-like flag submission (honeypot filled) is silently swallowed", async () => {
    const res = await fetch(`${PROD_BASE}/api/flags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wordId: 1, flagType: "incorrect", message: "story-test honeypot probe",
        renderedAt: Date.now() - 5000, website: "http://spam.example",
      }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { success?: boolean };
    expect(data.success).toBe(true);
  });

  it("US-006: a flag without details is rejected before insert", async () => {
    const res = await fetch(`${PROD_BASE}/api/flags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wordId: 1, flagType: "incorrect", message: "",
        renderedAt: Date.now() - 5000,
      }),
    });
    expect(res.status).toBe(400);
  });

  it("US-006: /api/health reports curation and grammar-quality metrics", async () => {
    const res = await fetch(`${PROD_BASE}/api/health`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { metrics: Array<{ key: string; value: unknown }> };
    const byKey = new Map(data.metrics.map((m) => [m.key, m.value]));
    expect(byKey.has("open_flags_total")).toBe(true);
    // Regression for the 1000-row truncation (PR #89): the scan must page through every
    // grammar row the public can read. Since 069 that is only the Mahan Kosh's (~8k rows;
    // Shackle and the pad-arth are curator-only, #39 #264), so no word has a cross-source
    // conflict and grammar_conflicts is 0. Its polysemy count (~1,000) would fall to ~130
    // if the scan stopped at 1,000 rows.
    const conflicts = byKey.get("grammar_conflicts");
    expect(typeof conflicts).toBe("number");
    expect(byKey.get("grammar_polysemy") as number).toBeGreaterThan(500);
    // /api/health recomputes everything live, including the paginated 20k-row
    // conflict scan, so give it well beyond the default 5s.
  }, 60000);
});
