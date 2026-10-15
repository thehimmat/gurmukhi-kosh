/**
 * fetchPosMap keeps the shared client's pos_mappings read for an hour (#200):
 * the word page called it on every request for a table that changes only with
 * a migration. A failed read must not be cached.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const select = vi.fn();
vi.mock("../lib/supabase", () => ({
  supabase: { from: () => ({ select }) },
}));

const rows = [{ source_code: "shackle", pos_raw: "m.", pos_norm: "noun" }];

beforeEach(() => {
  vi.resetModules();
  select.mockReset();
});

describe("fetchPosMap", () => {
  it("reads pos_mappings once for repeated calls", async () => {
    select.mockResolvedValue({ data: rows, error: null });
    const { fetchPosMap } = await import("../lib/word-data");
    const a = await fetchPosMap();
    const b = await fetchPosMap();
    expect(select).toHaveBeenCalledTimes(1);
    expect(b).toBe(a);
  });

  it("reads again after a failed read", async () => {
    select.mockResolvedValueOnce({ data: null, error: { message: "timeout" } });
    select.mockResolvedValueOnce({ data: rows, error: null });
    const { fetchPosMap } = await import("../lib/word-data");
    await expect(fetchPosMap()).rejects.toThrow("timeout");
    await expect(fetchPosMap()).resolves.toBeDefined();
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("always reads fresh through a caller's own client", async () => {
    select.mockResolvedValue({ data: rows, error: null });
    const { fetchPosMap } = await import("../lib/word-data");
    const own = { from: () => ({ select }) } as never;
    await fetchPosMap(own);
    await fetchPosMap(own);
    expect(select).toHaveBeenCalledTimes(2);
  });
});
