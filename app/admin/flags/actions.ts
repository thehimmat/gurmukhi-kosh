"use server";

import { supabaseAdmin } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

const REVIEW_STATUSES = ["approved", "needs_work", "rejected"] as const;
const TARGET_TABLES = ["word_grammar", "definitions", "etymology"] as const;

function checkKey(formData: FormData): void {
  const key = formData.get("key");
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    throw new Error("Unauthorized");
  }
}

/**
 * Resolves or dismisses a flag, optionally routing the decision into the
 * target row's existing review_status/curation_note (migration 003) so a
 * flag's outcome joins the same provenance trail every other datum carries.
 */
export async function resolveFlag(formData: FormData) {
  checkKey(formData);

  const flagId = Number(formData.get("flagId"));
  const decision = formData.get("decision");
  if (!Number.isInteger(flagId) || (decision !== "resolved" && decision !== "dismissed")) {
    throw new Error("Invalid request");
  }
  const resolutionNote = (formData.get("resolutionNote") as string | null)?.trim() || null;
  const reviewStatus = formData.get("reviewStatus") as string | null;
  const targetTable = formData.get("targetTable") as string | null;
  const targetId = formData.get("targetId") ? Number(formData.get("targetId")) : null;

  const db = supabaseAdmin();

  const { error } = await db
    .from("flags")
    .update({ status: decision, resolution_note: resolutionNote, resolved_at: new Date().toISOString() })
    .eq("id", flagId);
  if (error) throw new Error(error.message);

  if (
    reviewStatus &&
    (REVIEW_STATUSES as readonly string[]).includes(reviewStatus) &&
    targetTable &&
    (TARGET_TABLES as readonly string[]).includes(targetTable) &&
    targetId
  ) {
    const { error: targetError } = await db
      .from(targetTable)
      .update({
        review_status: reviewStatus,
        curation_note: resolutionNote,
        reviewed_by: "admin-flag-review",
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", targetId);
    if (targetError) throw new Error(targetError.message);
  }

  revalidatePath("/admin/flags");
}
