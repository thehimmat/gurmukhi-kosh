// The pad-arth builder's client-side picking state (#23), as pure functions the component calls.
// An item is one word or one phrase of one line; its pick is the refs chosen (in the candidates'
// order), an optional override and note, and any saved refs whose row is gone (orphans: shown
// from their snapshot, and dropped by the next save of that item, which the UI warns about).

import type { SavePickInput, RefChoice } from "@/app/admin/padarth/actions";
import type { Candidate, DraftLine } from "./draft";
import { pickStates, positionsKey, type SavedPick, type SavedRef } from "./picks";

export type Item = { lineId: number; kind: "word" | "phrase"; positions: number[]; surface: string; candidates: Candidate[] };

export type ItemPick = { refs: RefChoice[]; override: string | null; note: string | null; orphans: SavedRef[] };

export const itemKey = (lineId: number, positions: number[]) => `${lineId}|${positionsKey(positions)}`;

export const choiceOf = (c: Candidate): RefChoice =>
  c.kind === "padarth_gloss" ? { kind: "padarth_gloss", id: c.glossId } : { kind: "definition", id: c.definitionId };

const same = (a: RefChoice, b: RefChoice) => a.kind === b.kind && a.id === b.id;

export function flatItems(drafts: DraftLine[]): Item[] {
  return drafts.flatMap((d) => [
    ...d.words.map((w): Item => ({ lineId: d.lineId, kind: "word", positions: [w.position], surface: w.gurmukhi, candidates: w.candidates })),
    ...d.phrases.map((p): Item => ({ lineId: d.lineId, kind: "phrase", positions: p.positions, surface: p.surface, candidates: p.candidates })),
  ]);
}

export function initialPicks(drafts: DraftLine[], saved: SavedPick[]): Map<string, ItemPick> {
  const out = new Map<string, ItemPick>();
  for (const d of drafts) {
    const states = pickStates(d, saved);
    const all = [
      ...[...states.words].map(([pos, s]) => ({ positions: [pos], s })),
      ...[...states.phrases].map(([k, s]) => ({ positions: k.split(",").map(Number), s })),
    ];
    for (const { positions, s } of all) {
      if (!s.pick) continue;
      const refs: RefChoice[] = [...s.picked].map((k) => {
        const [kind, id] = k.split(":");
        return { kind: kind as RefChoice["kind"], id: Number(id) };
      });
      // A ref whose row still exists but is no longer offered can be sent again as it is.
      for (const r of s.orphans) {
        const id = r.refKind === "padarth_gloss" ? r.padarthGlossId : r.definitionId;
        if (id !== null) refs.push({ kind: r.refKind, id });
      }
      out.set(itemKey(d.lineId, positions), {
        refs,
        override: s.pick.overrideText,
        note: s.pick.noteText,
        orphans: s.orphans.filter((r) => (r.refKind === "padarth_gloss" ? r.padarthGlossId : r.definitionId) === null),
      });
    }
  }
  return out;
}

const EMPTY: ItemPick = { refs: [], override: null, note: null, orphans: [] };

export function toggleChoice(pick: ItemPick | undefined, choice: RefChoice, candidateOrder: RefChoice[]): ItemPick {
  const p = pick ?? EMPTY;
  const chosen = p.refs.some((r) => same(r, choice)) ? p.refs.filter((r) => !same(r, choice)) : [...p.refs, choice];
  const inOrder = candidateOrder.filter((c) => chosen.some((r) => same(r, c)));
  const rest = chosen.filter((r) => !candidateOrder.some((c) => same(r, c)));
  return { ...p, refs: [...inOrder, ...rest] };
}

export function withText(pick: ItemPick | undefined, field: "override" | "note", text: string): ItemPick {
  const v = text.trim() === "" ? null : text.trim();
  return { ...(pick ?? EMPTY), [field]: v };
}

export const isEmpty = (p: ItemPick) => p.refs.length === 0 && p.override === null && p.note === null;

export const isChosen = (p: ItemPick | undefined, c: Candidate) => !!p?.refs.some((r) => same(r, choiceOf(c)));

export function saveInput(key: string, item: Item, p: ItemPick): SavePickInput {
  return { key, lineId: item.lineId, positions: item.positions, surface: item.surface, refs: p.refs, overrideText: p.override, noteText: p.note };
}
