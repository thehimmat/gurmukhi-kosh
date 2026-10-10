import { describe, expect, it } from "vitest";
import { lineIdByVerseId } from "../pipeline/shared/lines";

type LineRow = { id: number; verse_id: number };

/**
 * Builder over a fixed multi-corpus dataset that mimics PostgREST's .eq()/.in(),
 * including the behaviour under test: a caller that never filters on source_fk
 * sees every corpus's row for the same verse_id. The dataset mirrors the real
 * collision from #162 — SGGS (source_fk 1) and Sri Sarbloh (source_fk 4) both
 * number verses from 1 — with Sarbloh's ids ordered LAST, so an unscoped
 * Map<verse_id, line_id> would end up holding Sarbloh's ids.
 */
function fakeLines() {
  const rows: (LineRow & { source_fk: number })[] = [
    { id: 11, verse_id: 1, source_fk: 1 },
    { id: 12, verse_id: 2, source_fk: 1 },
    { id: 13, verse_id: 3, source_fk: 1 },
    { id: 941, verse_id: 1, source_fk: 4 },
    { id: 942, verse_id: 2, source_fk: 4 },
    { id: 943, verse_id: 3, source_fk: 4 },
  ];
  let calls = 0;
  const inLists: number[][] = [];
  const build = () => {
    let source: number | null = null;
    const q = {
      eq(column: string, value: number) {
        if (column === "source_fk") source = value;
        return q;
      },
      in(_column: string, values: number[]) {
        calls++;
        inLists.push(values);
        const hit = rows.filter(
          (r) => values.includes(r.verse_id) && (source === null || r.source_fk === source)
        );
        return Promise.resolve({
          data: hit.map(({ id, verse_id }) => ({ id, verse_id })),
          error: null,
        });
      },
    };
    return q;
  };
  return { build, callCount: () => calls, inLists: () => inLists };
}

describe("lineIdByVerseId", () => {
  it("resolves verse ids to the requested source's lines, not another corpus's", async () => {
    const t = fakeLines();
    const map = await lineIdByVerseId(t.build, 1, [1, 2, 3]);
    expect([...map.entries()]).toEqual([
      [1, 11],
      [2, 12],
      [3, 13],
    ]);
  });

  // The regression this helper exists for: Sarbloh's rows share SGGS's verse ids
  // and sort after them, so an unscoped lookup would hand back 941-943 and the
  // ingest would file SGGS commentary on Sri Sarbloh lines.
  it("does not return the colliding corpus's ids for the same verse ids", async () => {
    const t = fakeLines();
    const map = await lineIdByVerseId(t.build, 1, [1, 2, 3]);
    expect([...map.values()]).not.toContain(941);
    expect(map.get(1)).toBe(11);
  });

  it("resolves the other corpus when that is the one asked for", async () => {
    const t = fakeLines();
    const map = await lineIdByVerseId(t.build, 4, [1, 2, 3]);
    expect(map.get(1)).toBe(941);
  });

  it("chunks long verse-id lists", async () => {
    const t = fakeLines();
    await lineIdByVerseId(t.build, 1, [1, 2, 3], 2);
    expect(t.callCount()).toBe(2);
    expect(t.inLists()).toEqual([[1, 2], [3]]);
  });

  it("omits verses the source does not have", async () => {
    const t = fakeLines();
    const map = await lineIdByVerseId(t.build, 1, [2, 99]);
    expect(map.get(2)).toBe(12);
    expect(map.has(99)).toBe(false);
  });

  it("returns an empty map for no verse ids, without querying", async () => {
    const t = fakeLines();
    const map = await lineIdByVerseId(t.build, 1, []);
    expect(map.size).toBe(0);
    expect(t.callCount()).toBe(0);
  });

  it("throws with the source in the message when the query fails", async () => {
    const build = () => {
      const q = {
        eq: () => q,
        in: () => Promise.resolve({ data: null, error: { message: "boom" } }),
      };
      return q as never;
    };
    await expect(lineIdByVerseId(build, 1, [1])).rejects.toThrow(
      "lineIdByVerseId(source 1): boom"
    );
  });
});
