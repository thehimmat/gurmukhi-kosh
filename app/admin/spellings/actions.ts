"use server";

import { supabaseAdmin } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

function checkKey(formData: FormData): void {
  const key = formData.get("key");
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    throw new Error("Unauthorized");
  }
}

/**
 * Review one OCR spelling-candidate (issue #6). Either apply a corrected
 * Gurmukhi spelling to words.gurmukhi, or mark the printed form as correct.
 * Either way the row leaves the queue (spelling_reviewed_at is set).
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
  const update: Record<string, unknown> = {
    spelling_reviewed_at: new Date().toISOString(),
    spelling_review_note: note,
  };

  if (decision === "correct") {
    if (!corrected) throw new Error("A corrected spelling is required (or use “Looks correct”).");
    const { data: cur, error: curErr } = await db.from("words").select("gurmukhi").eq("id", wordId).single();
    if (curErr || !cur) throw new Error("Word not found");

    if (corrected !== cur.gurmukhi) {
      // words.gurmukhi is UNIQUE — refuse to clobber a different word.
      const { data: clash } = await db.from("words").select("id").eq("gurmukhi", corrected).maybeSingle();
      if (clash && clash.id !== wordId) {
        throw new Error(`“${corrected}” already exists as word #${clash.id}; needs a manual merge, not an in-place rename.`);
      }
      update.gurmukhi = corrected;
      // Human-verified now: it's no longer an unverified OCR reading. The
      // spelling_reviewed_at marker plus the corrected form record the outcome.
    }
  }

  const { error } = await db.from("words").update(update).eq("id", wordId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/spellings");
}
