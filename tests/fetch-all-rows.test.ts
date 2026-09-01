import { describe, expect, it } from "vitest";
import { fetchAllRows } from "../lib/fetch-all-rows";

type Row = { id: number };

/**
 * Builder over a fixed dataset that mimics PostgREST .range() paging,
 * including the silent behavior under test: a caller that never paginates
 * would only ever see the first page.
 */
function fakeTable(rowCount: number, opts: { failOnCall?: number } = {}) {
  const rows: Row[] = Array.from({ length: rowCount }, (_, i) => ({ id: i }));
  let calls = 0;
  const build = () => ({
    range(from: number, to: number) {
      calls++;
      if (opts.failOnCall === calls) {
        return Promise.resolve({ data: null, error: { message: "boom" } });
      }
      return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
    },
  });
  return { build, callCount: () => calls };
}

describe("fetchAllRows", () => {
  it("aggregates every page in order, past the per-request cap", async () => {
    const t = fakeTable(2500);
    const rows = await fetchAllRows<Row>("test", t.build, 1000);
    expect(rows).toHaveLength(2500);
    expect(rows[0].id).toBe(0);
    expect(rows[2499].id).toBe(2499);
    // 1000 + 1000 + 500: the short page ends the loop.
    expect(t.callCount()).toBe(3);
  });

  it("stops on an empty page when the total is an exact multiple of the page size", async () => {
    const t = fakeTable(2000);
    const rows = await fetchAllRows<Row>("test", t.build, 1000);
    expect(rows).toHaveLength(2000);
    expect(t.callCount()).toBe(3); // third page comes back empty
  });

  it("returns [] for an empty table", async () => {
    const t = fakeTable(0);
    expect(await fetchAllRows<Row>("test", t.build)).toEqual([]);
    expect(t.callCount()).toBe(1);
  });

  it("respects a custom page size", async () => {
    const t = fakeTable(7);
    const rows = await fetchAllRows<Row>("test", t.build, 3);
    expect(rows.map((r) => r.id)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(t.callCount()).toBe(3); // 3 + 3 + 1
  });

  it("throws with the label on a page error instead of returning partial data", async () => {
    const t = fakeTable(2500, { failOnCall: 2 });
    await expect(fetchAllRows<Row>("word_grammar", t.build, 1000)).rejects.toThrow(
      "fetchAllRows(word_grammar): boom"
    );
  });
});
