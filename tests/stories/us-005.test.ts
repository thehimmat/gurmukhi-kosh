// US-005: See per-line commentary and etymology alongside occurrences (active).
// Criteria: user-stories/US-005-per-line-commentary-and-etymology.md

import { describe, it, expect, beforeAll } from "vitest";
import { anonDb, curatorDb } from "./helpers";

describe("US-005: per-line commentary and etymology", () => {
  // The Darpan and Shackle's etymologies are curator-only until permission arrives (#264, #39), so
  // the corpus-scale counts read the curator's view; the public view is checked at the end.
  let db: ReturnType<typeof anonDb>;
  let pub: ReturnType<typeof anonDb>;
  beforeAll(() => {
    db = curatorDb();
    pub = anonDb();
  });

  it("US-005: the named commentary sources are registered", async () => {
    const { data, error } = await db.from("translation_sources").select("code");
    expect(error).toBeNull();
    const codes = (data as Array<{ code: string }>).map((r) => r.code);
    for (const expected of ["ss_darpan", "ss_padarth", "faridkot", "manmohan_pa", "manmohan_en"]) {
      expect(codes).toContain(expected);
    }
  });

  it("US-005: per-line commentary exists at corpus scale (250k+ rows)", async () => {
    // The planner's estimate: an exact count of 300k+ rows runs into the anon
    // role's 3s statement timeout whenever an ingest is writing the table, and
    // "more than 250k" doesn't need exactness.
    const { count, error } = await db
      .from("line_translations")
      .select("id", { count: "estimated", head: true });
    expect(error).toBeNull();
    expect(count).toBeGreaterThan(250000);
  });

  it("US-005: etymology chains exist for 10k+ words", async () => {
    const { count, error } = await db
      .from("etymology")
      .select("id", { count: "exact", head: true });
    expect(error).toBeNull();
    expect(count).toBeGreaterThan(14000);
  });

  it("US-005: the public sees no Darpan commentary (#264)", async () => {
    const { data, error } = await pub
      .from("line_translations")
      .select("id")
      .in("source_code", ["ss_darpan", "ss_padarth"])
      .limit(1);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
