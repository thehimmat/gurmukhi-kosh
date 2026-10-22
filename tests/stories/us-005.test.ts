// US-005: See per-line commentary and etymology alongside occurrences (active).
// Criteria: user-stories/US-005-per-line-commentary-and-etymology.md

import { describe, it, expect, beforeAll } from "vitest";
import { anonDb, viewFor, visibilityLive } from "./helpers";

describe("US-005: per-line commentary and etymology", () => {
  // The Darpan and Shackle's etymologies are curator-only until permission arrives (#264, #39). Each
  // corpus-scale count reads through viewFor (see us-004); the public view is checked at the end.
  let pub: ReturnType<typeof anonDb>;
  beforeAll(() => {
    pub = anonDb();
  });

  it("US-005: the named commentary sources are registered", async () => {
    const db = (await viewFor([]))!;
    const { data, error } = await db.from("translation_sources").select("code");
    expect(error).toBeNull();
    const codes = (data as Array<{ code: string }>).map((r) => r.code);
    for (const expected of ["ss_darpan", "ss_padarth", "faridkot", "manmohan_pa", "manmohan_en"]) {
      expect(codes).toContain(expected);
    }
  });

  it("US-005: per-line commentary exists at corpus scale (250k+ rows)", async (ctx) => {
    const db = await viewFor(["ss_darpan", "ss_padarth"]);
    if (!db) return ctx.skip();
    // The planner's estimate: an exact count of 300k+ rows runs into the anon
    // role's 3s statement timeout whenever an ingest is writing the table, and
    // "more than 250k" doesn't need exactness.
    const { count, error } = await db
      .from("line_translations")
      .select("id", { count: "estimated", head: true });
    expect(error).toBeNull();
    expect(count).toBeGreaterThan(250000);
  });

  it("US-005: etymology chains exist for 10k+ words", async (ctx) => {
    const db = await viewFor(["shackle"]);
    if (!db) return ctx.skip();
    const { count, error } = await db
      .from("etymology")
      .select("id", { count: "exact", head: true });
    expect(error).toBeNull();
    expect(count).toBeGreaterThan(14000);
  });

  // Enforced once 069 is live; until then the Darpan is still public.
  it("US-005: the public sees no Darpan commentary (#264)", async (ctx) => {
    if (!(await visibilityLive())) return ctx.skip();
    const { data, error } = await pub
      .from("line_translations")
      .select("id")
      .in("source_code", ["ss_darpan", "ss_padarth"])
      .limit(1);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
