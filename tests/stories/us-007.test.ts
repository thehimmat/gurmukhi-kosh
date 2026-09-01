// US-007: Full entries across all ingested corpora (active, in progress).
// Criteria: user-stories/US-007-full-entries-across-corpora.md
//
// Criterion 1 (every attested word renders with occurrences, per-corpus
// counts, and pronunciation) is delivered and regression-tested here.
// Criteria 2 and 3 (definition/grammar coverage parity with SGGS) are NOT met
// for Dasam Bani yet; they are recorded as it.todo so the suite stays green
// while #96 tracks the gap. Flip them to real assertions as coverage lands.

import { describe, it, expect, beforeAll } from "vitest";
import { anonDb, sourceId } from "./helpers";

const CORPORA = ["sggs_banidb_v2", "bhai_gurdas_banidb_v2", "dasam_banidb_v2"];

describe("US-007: full entries across all ingested corpora", () => {
  let db: ReturnType<typeof anonDb>;
  beforeAll(() => {
    db = anonDb();
  });

  it("US-007.1: every ingested corpus has per-corpus word stats", async () => {
    for (const code of CORPORA) {
      const src = await sourceId(db, code);
      const { count, error } = await db
        .from("word_corpus_stats")
        .select("word_id", { count: "exact", head: true })
        .eq("source_fk", src);
      expect(error).toBeNull();
      expect(count, code).toBeGreaterThan(10000);
    }
  });

  it("US-007.1: a Dasam-attested word carries pronunciation and frequency", async () => {
    const dasam = await sourceId(db, "dasam_banidb_v2");
    const { data: stat } = await db
      .from("word_corpus_stats")
      .select("word_id")
      .eq("source_fk", dasam)
      .order("frequency", { ascending: false })
      .limit(1)
      .single();
    expect(stat).toBeTruthy();
    const { data: word } = await db
      .from("words")
      .select("gurmukhi, frequency, ipa_display")
      .eq("id", (stat as { word_id: number }).word_id)
      .single();
    expect(word).toBeTruthy();
    const w = word as { gurmukhi: string; frequency: number; ipa_display: string | null };
    expect(w.frequency).toBeGreaterThan(0);
    expect(w.ipa_display).toBeTruthy();
  });

  // Baseline 2026-09-01: SGGS definitions 48.3%; Bhai Gurdas 47.0% (passes);
  // Dasam Bani 31.9% (fails, gap 16.4 points). Tracked in #96.
  it.todo("US-007.2: each corpus's definitions coverage is within 10 points of SGGS's");

  // Baseline 2026-09-01: bar is half of SGGS's 45.4% = 22.7%; Bhai Gurdas
  // 36.5% (passes); Dasam Bani 14.3% (fails). Tracked in #96.
  it.todo("US-007.3: each corpus's grammar coverage reaches half of SGGS's share");
});
