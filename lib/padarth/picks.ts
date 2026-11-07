// The pad-arth builder's saved picks (084, 085): loading them, laying them over a draft, and the
// hints from other lines. Pure apart from the two fetches at the bottom.
//
// A hint is what was picked for the same word on another line. It is only a hint: context changes
// which gloss fits, so nothing is ever preselected from it (#23).

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "../fetch-all-rows";
import type { Candidate, DraftLine } from "./draft";

export type SavedRef = {
  ordinal: number;
  refKind: "padarth_gloss" | "definition" | "collocation";
  sourceCode: string;
  /** null once the row is deleted, until padarth_relink_refs() finds it again. */
  padarthGlossId: number | null;
  definitionId: number | null;
  /** A dictionary phrase (087); absent on refs read before it. */
  collocationId?: number | null;
  snapshotTerm: string | null;
  snapshotText: string;
};

export type SavedPick = {
  id: number;
  lineId: number;
  positions: number[];
  surfaceText: string;
  overrideText: string | null;
  noteText: string | null;
  refs: SavedRef[];
};

export type PickState = {
  pick: SavedPick | null;
  /** candidateKey()s of the draft candidates this pick chose. */
  picked: Set<string>;
  /** Chosen refs that match no candidate now (row deleted, or no longer offered): shown from their snapshot. */
  orphans: SavedRef[];
};

export type Hint = { lineId: number; text: string };

export const candidateKey = (c: Candidate) =>
  c.kind === "padarth_gloss" ? `padarth_gloss:${c.glossId}` : c.kind === "collocation" ? `collocation:${c.collocationId}` : `definition:${c.definitionId}`;

/** The id of the row a saved ref names, or null once that row is gone. */
export const refRowId = (r: SavedRef): number | null =>
  r.refKind === "padarth_gloss" ? r.padarthGlossId : r.refKind === "collocation" ? (r.collocationId ?? null) : r.definitionId;

const refKey = (r: SavedRef) => {
  const id = refRowId(r);
  return id === null ? null : `${r.refKind}:${id}`;
};

export const positionsKey = (positions: number[]) => positions.join(",");

function stateOf(pick: SavedPick | undefined, candidates: Candidate[]): PickState {
  if (!pick) return { pick: null, picked: new Set(), orphans: [] };
  const offered = new Set(candidates.map(candidateKey));
  const picked = new Set<string>();
  const orphans: SavedRef[] = [];
  for (const r of [...pick.refs].sort((a, b) => a.ordinal - b.ordinal)) {
    const k = refKey(r);
    if (k && offered.has(k)) picked.add(k);
    else orphans.push(r);
  }
  return { pick, picked, orphans };
}

/** Each word's (by position) and phrase's (by positionsKey) pick state on one line. */
export function pickStates(draft: DraftLine, picks: SavedPick[]): { words: Map<number, PickState>; phrases: Map<string, PickState> } {
  const mine = new Map(picks.filter((p) => p.lineId === draft.lineId).map((p) => [positionsKey(p.positions), p]));
  return {
    words: new Map(draft.words.map((w) => [w.position, stateOf(mine.get(String(w.position)), w.candidates)])),
    phrases: new Map(draft.phrases.map((ph) => [positionsKey(ph.positions), stateOf(mine.get(positionsKey(ph.positions)), ph.candidates)])),
  };
}

/** What was picked for each single word on lines outside the scope, by the word's spelling. */
export function hintsBySurface(picks: SavedPick[], scopeLineIds: Set<number>): Map<string, Hint[]> {
  const out = new Map<string, Hint[]>();
  for (const p of [...picks].sort((a, b) => a.lineId - b.lineId)) {
    if (p.positions.length !== 1 || scopeLineIds.has(p.lineId)) continue;
    const text = p.overrideText ?? [...p.refs].sort((a, b) => a.ordinal - b.ordinal).map((r) => r.snapshotText).join("; ");
    if (!text) continue;
    out.set(p.surfaceText, [...(out.get(p.surfaceText) ?? []), { lineId: p.lineId, text }]);
  }
  return out;
}

// ── Queries ────────────────────────────────────────────────────────────────────────────────

type PickRow = {
  id: number;
  line_id: number;
  positions: number[];
  surface_text: string;
  override_text: string | null;
  note_text: string | null;
  padarth_pick_refs: {
    ordinal: number;
    ref_kind: "padarth_gloss" | "definition" | "collocation";
    source_code: string;
    padarth_gloss_id: number | null;
    definition_id: number | null;
    collocation_id?: number | null;
    snapshot_term: string | null;
    snapshot_text: string;
  }[];
};

const PICK_COLUMNS =
  "id, line_id, positions, surface_text, override_text, note_text," +
  " padarth_pick_refs(ordinal, ref_kind, source_code, padarth_gloss_id, definition_id, collocation_id, snapshot_term, snapshot_text)";
/** The columns before 087, while it isn't applied yet. */
const PICK_COLUMNS_084 = PICK_COLUMNS.replace(" collocation_id,", "");

/** PostgREST and Postgres codes for a missing column or table: a migration not applied yet. */
const NOT_APPLIED = new Set(["42703", "PGRST204", "PGRST205", "42P01"]);
const notApplied = (e: unknown) => NOT_APPLIED.has(((e as { code?: string })?.code ?? "") as string) || /does not exist|could not find/i.test(String((e as Error)?.message ?? e));

const toPick = (r: PickRow): SavedPick => ({
  id: r.id,
  lineId: r.line_id,
  positions: r.positions,
  surfaceText: r.surface_text,
  overrideText: r.override_text,
  noteText: r.note_text,
  refs: r.padarth_pick_refs.map((x) => ({
    ordinal: x.ordinal,
    refKind: x.ref_kind,
    sourceCode: x.source_code,
    padarthGlossId: x.padarth_gloss_id,
    definitionId: x.definition_id,
    collocationId: x.collocation_id ?? null,
    snapshotTerm: x.snapshot_term,
    snapshotText: x.snapshot_text,
  })),
});

const CHUNK = 200;
const chunks = <T>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / CHUNK) }, (_, i) => xs.slice(i * CHUNK, (i + 1) * CHUNK));

/** The picks and line notes on these lines (service-role client: these tables are the curator's). */
/** Picks where `column` is one of `values`, reading the 087 columns when they exist. */
async function selectPicks(db: SupabaseClient, label: string, column: "line_id" | "surface_text", values: (number | string)[], order: string): Promise<PickRow[]> {
  const run = (columns: string) =>
    fetchAllRows<PickRow>(label, () => db.from("padarth_picks").select(columns).in(column, values).order(order));
  try {
    return await run(PICK_COLUMNS);
  } catch (e) {
    if (!notApplied(e)) throw e;
    return run(PICK_COLUMNS_084);
  }
}

export async function fetchPicks(db: SupabaseClient, lineIds: number[]): Promise<{ picks: SavedPick[]; lineNotes: Map<number, string> }> {
  const picks: SavedPick[] = [];
  const lineNotes = new Map<number, string>();
  for (const ids of chunks(lineIds)) {
    const rows = await selectPicks(db, "padarth_picks", "line_id", ids, "id");
    picks.push(...rows.map(toPick));
    const notes = await fetchAllRows<{ line_id: number; note_text: string }>("padarth_line_notes", () =>
      db.from("padarth_line_notes").select("line_id, note_text").in("line_id", ids).order("line_id")
    );
    for (const n of notes) lineNotes.set(n.line_id, n.note_text);
  }
  return { picks, lineNotes };
}

export type CommentaryKind = "introduction" | "question";
export type Commentary = { lineId: number; kind: CommentaryKind; text: string };

/** PostgREST and Postgres codes for a missing table: migration 086 not applied yet. */
const MISSING_TABLE = new Set(["PGRST205", "42P01"]);

/**
 * The introductions and questions set before these lines (086). `available` is false when the
 * table isn't there yet, so the builder can say so instead of failing the whole page.
 */
export async function fetchCommentary(db: SupabaseClient, lineIds: number[]): Promise<{ commentary: Commentary[]; available: boolean }> {
  const commentary: Commentary[] = [];
  for (const ids of chunks(lineIds)) {
    const { data, error } = await db.from("padarth_commentary").select("line_id, kind, body_text").in("line_id", ids).order("line_id");
    if (error) {
      if (MISSING_TABLE.has(error.code ?? "")) return { commentary: [], available: false };
      throw new Error(`padarth_commentary: ${error.message}`);
    }
    for (const r of (data ?? []) as { line_id: number; kind: CommentaryKind; body_text: string }[]) {
      commentary.push({ lineId: r.line_id, kind: r.kind, text: r.body_text });
    }
  }
  return { commentary, available: true };
}

/** Picks of the same spellings on other lines, for hints. */
export async function fetchHintPicks(db: SupabaseClient, surfaces: string[]): Promise<SavedPick[]> {
  const out: SavedPick[] = [];
  for (const part of chunks([...new Set(surfaces)])) {
    const rows = await selectPicks(db, "padarth_picks hints", "surface_text", part, "line_id");
    out.push(...rows.map(toPick));
  }
  return out;
}
