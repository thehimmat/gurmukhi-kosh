import { beforeEach, describe, expect, it, vi } from "vitest";

// #254: health_stats() can come back null (it gives up at its 20s statement
// timeout) or with an error. /api/health must answer 503 "stats unavailable",
// not crash with a 500 reading fields off null.

let rpcResult: { data: unknown; error: { message: string } | null };

vi.mock("../lib/supabase", () => ({
  supabase: {
    rpc: () => Promise.resolve(rpcResult),
    // Every table query (the grammar conflict scan, the pos map) comes back empty.
    from() {
      const builder: unknown = new Proxy({}, {
        get(_, prop) {
          if (prop === "then") {
            return (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null, count: 0 }).then(ok);
          }
          return () => builder;
        },
      });
      return builder;
    },
  },
}));

const { GET } = await import("../app/api/health/route");
const { computeHealth, HealthStatsUnavailableError } = await import("../lib/health");

describe("health when health_stats() has no result (#254)", () => {
  beforeEach(() => {
    rpcResult = { data: null, error: null };
  });

  it("computeHealth throws HealthStatsUnavailableError on a null result", async () => {
    await expect(computeHealth()).rejects.toBeInstanceOf(HealthStatsUnavailableError);
  });

  it("computeHealth throws HealthStatsUnavailableError on an RPC error, keeping its message", async () => {
    rpcResult = { data: null, error: { message: "canceling statement due to statement timeout" } };
    const err = await computeHealth().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HealthStatsUnavailableError);
    expect((err as Error).message).toContain("statement timeout");
  });

  it("GET /api/health answers 503 with a reason, and isn't cached", async () => {
    const res = await GET();
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.error).toMatch(/stats unavailable/i);
  });
});
