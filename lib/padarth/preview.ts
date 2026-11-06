// The pad-arth preview (#23): the saved picks laid out like the maintainer's Japji document, line
// by line: the verse, then one row per word (`ਸ਼ਬਦ = gloss`), then the phrases, then the line note.
// Every word gets a row on every line, repeats included; thinning is an editing choice.
//
// A row's text, first that applies:
//   override   the curator's own wording
//   picked     the picked glosses, in their saved order, joined with "; "
//   draft      the top candidate, shown as not yet picked
//   uncovered  nothing to show
// Grammar: only what Shackle or Sahib Singh states (Shackle's label for a linked form, an imported
// row) is added as a parenthetical. Hedged clues stay in the builder: a preview reads as settled
// text. Mahan Kosh's part of speech stays in the builder too: it is on nearly every word and reads
// as noise in the finished pad-arth.

import type { DraftLine, GrammarNote } from "./draft";
import type { LineRow } from "./fetch";
import { pickStates, positionsKey, type PickState, type SavedPick } from "./picks";

export type PreviewStatus = "override" | "picked" | "draft" | "uncovered";

export type PreviewRow = { surface: string; text: string | null; status: PreviewStatus; grammar: string[]; note: string | null };

export type PreviewLine = { lineId: number; gurmukhi: string; rows: PreviewRow[]; phrases: PreviewRow[]; note: string | null };

const PREVIEW_GRAMMAR_SOURCES = new Set(["shackle", "ss_padarth"]);

/** "(3 sg. subj. of ਹੋਇ)", "(noun, singular)": the values Shackle or Sahib Singh state, as the document writes them. */
function statedGrammar(notes: GrammarNote[]): string[] {
  return notes.flatMap((n) => {
    if (n.tier !== "stated" || !PREVIEW_GRAMMAR_SOURCES.has(n.sourceCode)) return [];
    if (n.kind === "form_label") return [`${n.text} of ${n.headword}`];
    return [n.facts.map((f) => f.value).join(", ")];
  });
}

function row(surface: string, state: PickState | undefined, topText: string | null, grammar: GrammarNote[]): PreviewRow {
  const pick = state?.pick ?? null;
  const base = { surface, grammar: statedGrammar(grammar), note: pick?.noteText ?? null };
  if (pick?.overrideText) return { ...base, text: pick.overrideText, status: "override" };
  const picked = pick ? [...pick.refs].sort((a, b) => a.ordinal - b.ordinal).map((r) => r.snapshotText) : [];
  if (picked.length > 0) return { ...base, text: picked.join("; "), status: "picked" };
  if (topText !== null) return { ...base, text: topText, status: "draft" };
  return { ...base, text: null, status: "uncovered" };
}

export function buildPreview(lines: LineRow[], drafts: DraftLine[], picks: SavedPick[], lineNotes: Map<number, string>): PreviewLine[] {
  const byId = new Map(lines.map((l) => [l.id, l]));
  return drafts.flatMap((d) => {
    const line = byId.get(d.lineId);
    if (!line) return [];
    const states = pickStates(d, picks);
    return [
      {
        lineId: d.lineId,
        gurmukhi: line.gurmukhi,
        rows: d.words.map((w) => row(w.gurmukhi, states.words.get(w.position), w.candidates[0]?.text ?? null, w.grammar)),
        phrases: d.phrases.map((p) => row(p.surface, states.phrases.get(positionsKey(p.positions)), p.candidates[0]?.text ?? null, p.grammar)),
        note: lineNotes.get(d.lineId) ?? null,
      },
    ];
  });
}
