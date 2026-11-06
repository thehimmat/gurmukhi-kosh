// Live: the pad-arth draft loader against prod. The query plumbing runs with the anon key (CI);
// the pad-arth content is curator-only (#264), so those checks need a curator key and skip
// otherwise. Japji Pauri 1 is SGGS lines 5–10, on ang 1 (keyed on lines.id per #162).

import { describe, it, expect, beforeAll } from "vitest";
import { anonDb, viewFor } from "./stories/helpers";
import { fetchDraft, fetchDraftRows, buildDraftInputs, fetchScopeLines } from "../lib/padarth/fetch";
import { draftLine, type DraftLine } from "../lib/padarth/draft";

describe("pad-arth draft loader", () => {
  it("loads ang 1 of Guru Granth Sahib in reading order, every line drafted with its words", async () => {
    const { lines, drafts } = await fetchDraft(anonDb(), { kind: "ang", sourceCode: "sggs_banidb_v2", ang: 1 });
    expect(lines.length).toBeGreaterThan(10);
    expect(lines.map((l) => l.id)).toEqual(expect.arrayContaining([5, 6, 7, 8, 9, 10]));
    const verses = lines.map((l) => l.verse_id);
    expect(verses).toEqual([...verses].sort((a, b) => a - b));
    expect(drafts.map((d) => d.lineId)).toEqual(lines.map((l) => l.id));
    expect(drafts.every((d) => d.words.length > 0)).toBe(true);
    // Mahan Kosh is public, so most words already have something to show.
    const words = drafts.flatMap((d) => d.words);
    expect(words.filter((w) => !w.uncovered).length / words.length).toBeGreaterThan(0.5);
  });

  it("loads a shabad's lines", async () => {
    const lines = await fetchScopeLines(anonDb(), { kind: "shabad", shabadId: 1 });
    expect(lines.map((l) => l.id)).toEqual(expect.arrayContaining([5, 9]));
  });
});

describe("pad-arth draft of Japji Pauri 1, with the curator's sources", () => {
  let drafts: DraftLine[] = [];
  let hidden = false;

  beforeAll(async () => {
    const db = await viewFor(["ss_padarth", "shackle"]);
    if (!db) {
      hidden = true;
      return;
    }
    const lines = (await fetchScopeLines(db, { kind: "ang", sourceCode: "sggs_banidb_v2", ang: 1 })).filter((l) => l.id >= 5 && l.id <= 10);
    drafts = buildDraftInputs(await fetchDraftRows(db, lines)).map(draftLine);
  });

  const line = (id: number) => drafts.find((d) => d.lineId === id)!;

  it("puts Sahib Singh's gloss on the words he glosses", (ctx) => {
    if (hidden) return ctx.skip();
    const glossed = drafts.flatMap((d) => d.words).filter((w) => w.candidates[0]?.kind === "padarth_gloss");
    expect(glossed.length).toBeGreaterThan(15);
  });

  it("drafts the phrases ਨ ਹੋਵਈ (line 5) and the gapped ਕੂੜੈ … ਪਾਲਿ (line 9)", (ctx) => {
    if (hidden) return ctx.skip();
    expect(line(5).phrases.map((p) => p.positions)).toContainEqual([2, 3]);
    expect(line(9).phrases).toContainEqual(expect.objectContaining({ positions: [4, 6], surface: "ਕੂੜੈ … ਪਾਲਿ" }));
  });

  it("hedges ਹੁਕਮਿ's case from Sahib Singh's gloss (line 10)", (ctx) => {
    if (hidden) return ctx.skip();
    const hukam = line(10).words.find((w) => w.gurmukhi === "ਹੁਕਮਿ");
    expect(hukam?.grammar).toContainEqual(expect.objectContaining({ tier: "clue", gramCase: "locative", basis: "ਹੁਕਮ ਵਿਚ" }));
  });

  it("states grammar only from Sahib Singh, Shackle and Mahan Kosh, and hedges only Sahib Singh's case", (ctx) => {
    if (hidden) return ctx.skip();
    const notes = drafts.flatMap((d) => [...d.words, ...d.phrases].flatMap((w) => w.grammar));
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) {
      expect(["ss_padarth", "shackle", "mahan_kosh"]).toContain(n.sourceCode);
      if (n.tier === "clue") expect(n.sourceCode).toBe("ss_padarth");
    }
  });
});
