// Live: parse + align over Japji Pauri 1 as stored in prod (SGGS line ids
// 5–10, keyed on lines.id per #162), so a change in the stored pad-arth or
// occurrences that breaks placement shows up here. Groundwork for #165.

import { describe, it, expect, beforeAll } from "vitest";
import { anonDb } from "./stories/helpers";
import { parsePadarth } from "../lib/padarth/parse";
import { alignTerms, type TermMatch } from "../lib/padarth/align";

type OccRow = { line_id: number; position: number; words: { gurmukhi: string } | null };
type PadRow = { line_id: number; body_unicode: string };

const PAURI_1 = [5, 6, 7, 8, 9, 10];

describe("pad-arth parse + align on Japji Pauri 1", () => {
  const placed: { term: string; match: TermMatch | null; tokens: string[] }[] = [];

  beforeAll(async () => {
    const db = anonDb();
    const [o, p] = await Promise.all([
      db.from("word_occurrences").select("line_id, position, words(gurmukhi)").in("line_id", PAURI_1),
      db.from("line_translations").select("line_id, body_unicode").in("line_id", PAURI_1).eq("source_code", "ss_padarth"),
    ]);
    expect(o.error ?? p.error).toBeNull();
    const occ = o.data as unknown as OccRow[];
    for (const row of p.data as PadRow[]) {
      const tokens = occ
        .filter((r) => r.line_id === row.line_id)
        .sort((a, b) => a.position - b.position)
        .map((r) => r.words?.gurmukhi ?? "");
      const terms = parsePadarth(row.body_unicode).entries.map((e) => e.term);
      alignTerms(tokens, terms).forEach((match, k) => placed.push({ term: terms[k], match, tokens }));
    }
  });

  it("places nearly every glossed term on a word of its own line", () => {
    expect(placed.length).toBeGreaterThan(20);
    const hits = placed.filter((p) => p.match !== null).length;
    expect(hits / placed.length).toBeGreaterThan(0.9);
  });

  it("finds the phrases, including one whose words are apart", () => {
    const at = (term: string) => placed.find((p) => p.term === term)?.match;
    expect(at("ਨ ਹੋਵਈ")?.positions).toEqual([2, 3]);
    expect(at("ਕੂੜੈ ਪਾਲਿ")).toEqual({ positions: [4, 6], match: "gapped" });
  });
});
