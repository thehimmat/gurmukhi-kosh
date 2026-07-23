"use server";

import { supabaseAdmin } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

type DB = ReturnType<typeof supabaseAdmin>;

function checkKey(formData: FormData): void {
  const key = formData.get("key");
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    throw new Error("Unauthorized");
  }
}

/**
 * Merge off-corpus word `fromId` into existing word `toId` (used when a
 * corrected spelling turns out to already exist — usually the real corpus word
 * the OCR error hid). Re-points `fromId`'s dictionary content onto `toId`, then
 * deletes the now-empty off-corpus row. `fromId` is Shackle-only (off-corpus),
 * so all its children move.
 *
 * definitions.UNIQUE(word_id, dict_source_id, sense_number) and
 * etymology.UNIQUE(word_id, order_index) mean the moved rows must be renumbered
 * above whatever `toId` already has.
 */
async function mergeWordInto(db: DB, fromId: number, toId: number) {
  // etymology: renumber above toId's existing order_index values
  const [{ data: toEtym }, { data: fromEtym }] = await Promise.all([
    db.from("etymology").select("order_index").eq("word_id", toId),
    db.from("etymology").select("id").eq("word_id", fromId).order("order_index", { ascending: true }),
  ]);
  let etymNext = Math.max(0, ...((toEtym ?? []).map((r) => r.order_index as number)));
  for (const row of fromEtym ?? []) {
    etymNext += 1;
    const { error } = await db.from("etymology").update({ word_id: toId, order_index: etymNext }).eq("id", row.id as number);
    if (error) throw new Error(`merge etymology: ${error.message}`);
  }

  // definitions: renumber sense_number above toId's existing max
  const [{ data: toDefs }, { data: fromDefs }] = await Promise.all([
    db.from("definitions").select("sense_number").eq("word_id", toId),
    db.from("definitions").select("id").eq("word_id", fromId).order("sense_number", { ascending: true }),
  ]);
  let senseNext = Math.max(0, ...((toDefs ?? []).map((r) => (r.sense_number as number) ?? 0)));
  for (const row of fromDefs ?? []) {
    senseNext += 1;
    const { error } = await db.from("definitions").update({ word_id: toId, sense_number: senseNext }).eq("id", row.id as number);
    if (error) throw new Error(`merge definitions: ${error.message}`);
  }

  // grammar + examples: no per-word unique constraint, straight re-point
  const g = await db.from("word_grammar").update({ word_id: toId }).eq("word_id", fromId);
  if (g.error) throw new Error(`merge grammar: ${g.error.message}`);
  const x = await db.from("dict_examples").update({ word_id: toId }).eq("word_id", fromId);
  if (x.error) throw new Error(`merge examples: ${x.error.message}`);

  // The off-corpus row is now empty — remove it.
  const del = await db.from("words").delete().eq("id", fromId);
  if (del.error) throw new Error(`merge delete: ${del.error.message}`);
}

/**
 * Review one OCR spelling-candidate (issue #6). Apply a corrected Gurmukhi
 * spelling, or mark the printed form correct. The row then leaves the queue.
 */
export async function submitSpellingReview(formData: FormData) {
  checkKey(formData);

  const wordId = Number(formData.get("wordId"));
  const decision = formData.get("decision"); // "correct" | "keep"
  const corrected = ((formData.get("corrected") as string | null) ?? "").trim();
  const note = ((formData.get("note") as string | null) ?? "").trim() || null;
  if (!Number.isInteger(wordId) || (decision !== "correct" && decision !== "keep")) {
    throw new Error("Invalid request");
  }

  const db = supabaseAdmin();

  if (decision === "correct") {
    if (!corrected) throw new Error("A corrected spelling is required (or use “Printed is correct”).");
    const { data: cur, error: curErr } = await db.from("words").select("gurmukhi").eq("id", wordId).single();
    if (curErr || !cur) throw new Error("Word not found");

    if (corrected !== cur.gurmukhi) {
      // words.gurmukhi is UNIQUE. If the corrected form already exists, the
      // Shackle content belongs on that word — merge rather than clobber.
      const { data: clash } = await db.from("words").select("id").eq("gurmukhi", corrected).maybeSingle();
      if (clash && clash.id !== wordId) {
        await mergeWordInto(db, wordId, clash.id as number);
        revalidatePath("/admin/spellings");
        return; // source row is gone; nothing else to update
      }
      // Otherwise a plain in-place rename.
      const { error } = await db
        .from("words")
        .update({ gurmukhi: corrected, spelling_reviewed_at: new Date().toISOString(), spelling_review_note: note })
        .eq("id", wordId);
      if (error) throw new Error(error.message);
      revalidatePath("/admin/spellings");
      return;
    }
  }

  // "keep", or "correct" with no actual change: just mark reviewed.
  const { error } = await db
    .from("words")
    .update({ spelling_reviewed_at: new Date().toISOString(), spelling_review_note: note })
    .eq("id", wordId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/spellings");
}
