// US-008: Build a word-by-word pad-arth for a selected passage (active).
// Criteria: user-stories/US-008-padarth-builder.md
//
// Live: runs the pure lib/padarth layer over Japji shabad 1 as stored in prod
// (SGGS line ids 1–10), so a change in the stored pad-arth or occurrences that
// breaks placement shows up here.

import { describe, it, expect, beforeAll } from "vitest";
import { anonDb } from "./helpers";
import { assemblePassage } from "../../lib/padarth/assemble";
import { pauriGroups } from "../../lib/padarth/pauri";
import { passageToMarkdown } from "../../lib/padarth/markdown";

type LineRow = { id: number; ang: number; line_no: number; gurmukhi: string };
type OccRow = { line_id: number; position: number; word_id: number; words: { gurmukhi: string } | null };
type PadRow = { line_id: number; source_code: string; body_unicode: string };

describe("US-008: pad-arth builder", () => {
  let lines: LineRow[];
  let occ: OccRow[];
  let pad: PadRow[];

  beforeAll(async () => {
    const db = anonDb();
    const ids = Array.from({ length: 10 }, (_, i) => i + 1);
    const [l, o, p] = await Promise.all([
      db.from("lines").select("id, ang, line_no, gurmukhi").in("id", ids).order("id"),
      db.from("word_occurrences").select("line_id, position, word_id, words(gurmukhi)").in("line_id", ids),
      db.from("line_translations").select("line_id, source_code, body_unicode").in("line_id", ids).eq("source_code", "ss_padarth"),
    ]);
    expect(l.error ?? o.error ?? p.error).toBeNull();
    lines = l.data as LineRow[];
    occ = o.data as unknown as OccRow[];
    pad = p.data as PadRow[];
  });

  function passage(lineIds: number[]) {
    return assemblePassage({
      lines: lines.filter((l) => lineIds.includes(l.id)).map((l) => ({ id: l.id, ang: l.ang, lineNo: l.line_no, gurmukhi: l.gurmukhi })),
      occurrences: occ
        .filter((r) => lineIds.includes(r.line_id))
        .map((r) => ({ lineId: r.line_id, position: r.position, wordId: r.word_id, gurmukhi: r.words?.gurmukhi ?? "" })),
      definitions: [],
      phraseDefinitions: [],
      baseForms: [],
      grammar: [],
      translations: pad.map((r) => ({ lineId: r.line_id, sourceCode: r.source_code, body: r.body_unicode })),
      dictSourceOrder: ["mahan_kosh", "shackle"],
      translationOrder: [],
    });
  }

  it("US-008.5: Japji shabad 1 groups into the opening salok and pauri 1", () => {
    expect(pauriGroups(lines).map((g) => g.map((l) => l.id))).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8, 9, 10],
    ]);
  });

  it("US-008.1/2: pauri 1 lists every word and places nearly all pad-arth terms", () => {
    const out = passage([5, 6, 7, 8, 9, 10]);
    for (const l of out.lines) {
      expect(l.words.map((w) => w.gurmukhi).join(" ")).toBe(l.gurmukhi.replace(/\s*॥.*$/, ""));
    }
    const placed = out.lines.reduce(
      (n, l) => n + l.words.reduce((k, w) => k + w.padarth.length, 0) + l.phrases.reduce((k, p) => k + p.padarth.length, 0),
      0
    );
    const unplaced = out.lines.reduce((n, l) => n + l.padarthUnplaced.length, 0);
    expect(placed + unplaced).toBeGreaterThan(20);
    expect(placed / (placed + unplaced)).toBeGreaterThan(0.9);
  });

  it("US-008.3: phrases from the pad-arth are their own items (ਨ ਹੋਵਈ, ਕੂੜੈ … ਪਾਲਿ)", () => {
    const phrases = passage([5, 6, 7, 8, 9, 10]).lines.flatMap((l) => l.phrases.map((p) => p.text));
    expect(phrases).toContain("ਨ ਹੋਵਈ");
    expect(phrases).toContain("ਕੂੜੈ … ਪਾਲਿ");
  });

  it("US-008.6: the passage renders as Markdown", () => {
    const md = passageToMarkdown(passage([5]));
    expect(md).toContain("### ਸੋਚੈ ਸੋਚਿ ਨ ਹੋਵਈ ਜੇ ਸੋਚੀ ਲਖ ਵਾਰ ॥");
    expect(md).toContain("**ਨ ਹੋਵਈ** (phrase)");
  });
});
