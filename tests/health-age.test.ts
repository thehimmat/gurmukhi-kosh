import { describe, it, expect } from "vitest";
import { statsAgeMetric } from "../lib/health-age";

describe("statsAgeMetric: how old health_stats' cached totals are (075)", () => {
  it("says how long ago the totals were computed", () => {
    const at = "2026-10-23T10:00:00+00:00";
    expect(statsAgeMetric(at, 30).value).toBe(`just now (${at})`);
    expect(statsAgeMetric(at, 45 * 60).value).toBe(`45 min ago (${at})`);
    expect(statsAgeMetric(at, 5 * 3600 + 59 * 60).value).toBe(`5 h ago (${at})`);
    expect(statsAgeMetric(at, 3 * 86400).value).toBe(`3 d ago (${at})`);
    expect(statsAgeMetric(at, 30).status).toBe("info");
  });

  it("warns when the totals were never computed", () => {
    const m = statsAgeMetric(null, null);
    expect(m.value).toBe("never");
    expect(m.status).toBe("warn");
  });
});
