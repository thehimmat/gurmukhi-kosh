/**
 * Every ingest that changes a table /health counts ends by refreshing health_stats_cache (075), and
 * fails loudly when the refresh does: an unchecked rpc() once left the frequency stats empty while
 * the run reported success (030).
 * Run: npm test
 */

import { describe, it, expect } from "vitest";
import { refreshHealthStats } from "../pipeline/shared/health-stats";

const fakeDb = (error: { message: string } | null, calls: string[] = []) => ({
  rpc(fn: string) {
    calls.push(fn);
    return Promise.resolve({ data: null, error });
  },
});

describe("refreshHealthStats", () => {
  it("calls refresh_health_stats", async () => {
    const calls: string[] = [];
    await refreshHealthStats(fakeDb(null, calls));
    expect(calls).toEqual(["refresh_health_stats"]);
  });

  it("throws, naming the SQL to re-run, when the refresh fails", async () => {
    await expect(refreshHealthStats(fakeDb({ message: "canceling statement due to statement timeout" })))
      .rejects.toThrow(/refresh_health_stats failed: canceling statement[^]*select refresh_health_stats\(\);/);
  });
});
