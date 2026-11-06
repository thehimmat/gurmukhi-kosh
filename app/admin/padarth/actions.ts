"use server";

// The pad-arth builder's writes (#23). Checked against the admin cookie (never an argument, so the
// key stays out of action payloads), then one call each:
// a pick goes through padarth_save_pick() (085), which builds each ref's snapshot and key from the
// row itself, in one transaction.

import { curatorDb } from "@/lib/curator";
import { requireAdmin } from "@/lib/curator-session";

export type RefChoice = { kind: "padarth_gloss" | "definition"; id: number };

export type SavePickInput = {
  lineId: number;
  positions: number[];
  surface: string;
  refs: RefChoice[];
  overrideText: string | null;
  noteText: string | null;
};

const CHOSEN_BY = "curator";
const MAX_TEXT = 5000;

const isId = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) > 0;

function checkText(label: string, s: unknown): string | null {
  if (s === null || s === undefined) return null;
  if (typeof s !== "string" || s.length > MAX_TEXT) throw new Error(`Invalid ${label}`);
  return s;
}

export async function savePick(input: SavePickInput): Promise<{ pickId: number | null }> {
  await requireAdmin();
  const { lineId, positions, surface, refs } = input;
  if (!isId(lineId)) throw new Error("Invalid line");
  if (
    !Array.isArray(positions) ||
    positions.length === 0 ||
    !positions.every((p, i) => Number.isSafeInteger(p) && p >= 0 && (i === 0 || p > positions[i - 1]))
  ) {
    throw new Error("Invalid positions");
  }
  if (typeof surface !== "string" || surface.trim() === "" || surface.length > 500) throw new Error("Invalid surface");
  if (!Array.isArray(refs) || refs.length > 50 || !refs.every((r) => (r?.kind === "padarth_gloss" || r?.kind === "definition") && isId(r.id))) {
    throw new Error("Invalid refs");
  }
  const overrideText = checkText("override", input.overrideText);
  const noteText = checkText("note", input.noteText);

  const { data, error } = await curatorDb(true).rpc("padarth_save_pick", {
    p_line_id: lineId,
    p_positions: positions,
    p_surface: surface,
    p_override: overrideText,
    p_note: noteText,
    p_refs: refs.map((r) => ({ kind: r.kind, id: r.id })),
    p_chosen_by: CHOSEN_BY,
  });
  if (error) throw new Error(`Saving the pick failed: ${error.message}`);
  return { pickId: (data as number | null) ?? null };
}

export async function saveLineNote(input: { lineId: number; text: string }): Promise<void> {
  await requireAdmin();
  if (!isId(input.lineId)) throw new Error("Invalid line");
  const text = (checkText("note", input.text) ?? "").trim();
  const db = curatorDb(true);
  const { error } = text
    ? await db.from("padarth_line_notes").upsert({ line_id: input.lineId, note_text: text, chosen_by: CHOSEN_BY }, { onConflict: "line_id" })
    : await db.from("padarth_line_notes").delete().eq("line_id", input.lineId);
  if (error) throw new Error(`Saving the line note failed: ${error.message}`);
}
