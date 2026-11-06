// Live: the pad-arth rows the #165 ingest wrote for Japji Pauri 1 (SGGS line
// ids 5–10, keyed on lines.id per #162). tests/padarth-japji.test.ts checks
// parse + align on the raw text; this checks what actually landed in
// padarth_glosses, padarth_gloss_occurrences and padarth_case_evidence, so a
// re-run of `npm run ingest:padarth:glosses` (or a Shackle form rebuild that
// deletes via_base links) that loses rows shows up here (#179 item 2).

import { describe, it, expect, beforeAll } from "vitest";
import { viewFor } from "./stories/helpers";

type Link = {
  match: "exact" | "gapped" | "via_base";
  lexeme_id: number | null;
  word_occurrences: { line_id: number; position: number } | null;
};
type Gloss = {
  line_id: number;
  ordinal: number;
  kind: "entry" | "note";
  term: string | null;
  gloss: string;
  is_phrase: boolean;
  padarth_gloss_occurrences: Link[];
  padarth_case_evidence: { gram_case: string; marker: string; basis: string }[];
};

const PAURI_1 = [5, 6, 7, 8, 9, 10];

describe("pad-arth gloss rows for Japji Pauri 1", () => {
  let rows: Gloss[] = [];
  // The pad-arth is curator-only until permission arrives (#264): skip when no available key can see it.
  let hidden = false;

  beforeAll(async () => {
    const db = await viewFor(["ss_padarth"]);
    if (!db) {
      hidden = true;
      return;
    }
    const { data, error } = await db
      .from("padarth_glosses")
      .select(
        "line_id, ordinal, kind, term, gloss, is_phrase," +
          " padarth_gloss_occurrences(match, lexeme_id, word_occurrences(line_id, position))," +
          " padarth_case_evidence(gram_case, marker, basis)"
      )
      .eq("source_code", "ss_padarth")
      .in("line_id", PAURI_1)
      .order("line_id")
      .order("ordinal");
    expect(error).toBeNull();
    rows = data as unknown as Gloss[];
  });

  const entry = (lineId: number, term: string) => rows.find((r) => r.line_id === lineId && r.term === term);
  const positions = (g: Gloss | undefined) =>
    (g?.padarth_gloss_occurrences ?? []).map((l) => l.word_occurrences?.position).sort((a, b) => a! - b!);

  it("has entries on every line of the pauri", (ctx) => {
    if (hidden) return ctx.skip();
    for (const id of PAURI_1) {
      expect(rows.filter((r) => r.line_id === id && r.kind === "entry").length, `line ${id}`).toBeGreaterThan(0);
    }
  });

  it("links nearly every entry to a word of its own line", (ctx) => {
    if (hidden) return ctx.skip();
    const entries = rows.filter((r) => r.kind === "entry");
    expect(entries.length).toBeGreaterThan(20);
    const linked = entries.filter((r) => r.padarth_gloss_occurrences.length > 0);
    expect(linked.length / entries.length).toBeGreaterThan(0.9);
    // Links never leave the line the row is filed under.
    for (const r of linked) {
      for (const l of r.padarth_gloss_occurrences) expect(l.word_occurrences?.line_id).toBe(r.line_id);
    }
  });

  it("stores the phrase ਨ ਹੋਵਈ on both its words (line 5)", (ctx) => {
    if (hidden) return ctx.skip();
    const g = entry(5, "ਨ ਹੋਵਈ");
    expect(g?.is_phrase).toBe(true);
    expect(positions(g)).toEqual([2, 3]);
    expect(g?.padarth_gloss_occurrences.every((l) => l.match === "exact")).toBe(true);
  });

  it("stores the gapped phrase ਕੂੜੈ … ਪਾਲਿ on its two words (line 9)", (ctx) => {
    if (hidden) return ctx.skip();
    const g = entry(9, "ਕੂੜੈ ਪਾਲਿ");
    expect(g?.is_phrase).toBe(true);
    expect(positions(g)).toEqual([4, 6]);
    expect(g?.padarth_gloss_occurrences.every((l) => l.match === "gapped")).toBe(true);
  });

  it("stores case evidence read from the gloss, citing it (line 10, ਹੁਕਮਿ = ਹੁਕਮ ਵਿਚ)", (ctx) => {
    if (hidden) return ctx.skip();
    const g = entry(10, "ਹੁਕਮਿ");
    expect(g?.padarth_case_evidence).toContainEqual({ gram_case: "locative", marker: "ਵਿਚ", basis: "ਹੁਕਮ ਵਿਚ" });
    // Line 5's ਸੋਚੈ = … ਰੱਖਣ ਨਾਲ is instrumental: evidence is not only on line 10.
    expect(entry(5, "ਸੋਚੈ")?.padarth_case_evidence.map((c) => c.gram_case)).toContain("instrumental");
  });
});
