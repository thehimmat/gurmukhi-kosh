// US-002: Browse and search the corpus to reach any word (delivered).
// Criteria: user-stories/US-002-browse-and-search-the-corpus.md

import { describe, it, expect, beforeAll } from "vitest";
import { anonDb, PROD_BASE } from "./helpers";
import { foldGurmukhi } from "../../lib/gurmukhi-fold";

describe("US-002: browse and search reach any word", () => {
  let db: ReturnType<typeof anonDb>;
  beforeAll(() => {
    db = anonDb();
  });

  it("US-002: /api/search returns tiered hits for a Gurmukhi query", async () => {
    const res = await fetch(`${PROD_BASE}/api/search?q=${encodeURIComponent("ਸਤਿ")}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { words: Array<{ gurmukhi: string; match: string }> };
    expect(data.words.length).toBeGreaterThan(0);
    expect(["prefix", "fold", "contains"]).toContain(data.words[0].match);
  });

  it("US-002: the fold tier collapses spelling variants to one key", () => {
    // Dental/retroflex and nukta variants must fold together so a variant
    // spelling still finds the word (#63).
    expect(foldGurmukhi("ਸ਼ਬਦ")).toBe(foldGurmukhi("ਸਬਦ"));
    expect(foldGurmukhi("ਜ਼ੋਰ")).toBe(foldGurmukhi("ਜੋਰ"));
  });

  it("US-002: browse's frequency-ranked page is full and ordered", async () => {
    const { data, error } = await db
      .from("words")
      .select("id, frequency")
      .eq("in_corpus", true)
      .order("frequency", { ascending: false })
      .range(0, 49);
    expect(error).toBeNull();
    expect(data!.length).toBe(50);
    const freqs = (data as Array<{ frequency: number }>).map((w) => w.frequency);
    expect(freqs[0]).toBeGreaterThanOrEqual(freqs[49]);
  });
});
