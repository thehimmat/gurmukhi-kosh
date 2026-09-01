// US-005: See per-line commentary and etymology alongside occurrences (active).
// Criteria: user-stories/US-005-per-line-commentary-and-etymology.md

import { describe, it, expect, beforeAll } from "vitest";
import { anonDb } from "./helpers";

describe("US-005: per-line commentary and etymology", () => {
  let db: ReturnType<typeof anonDb>;
  beforeAll(() => {
    db = anonDb();
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
    const { count, error } = await db
      .from("line_translations")
      .select("id", { count: "exact", head: true });
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
});
