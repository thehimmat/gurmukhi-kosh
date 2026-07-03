import { supabase } from "@/lib/supabase";
import type { FlagTargetTable, FlagType } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const TARGET_TABLES: FlagTargetTable[] = ["word_grammar", "definitions", "etymology"];
const FLAG_TYPES: FlagType[] = ["incorrect", "unclear", "has_better_source", "other"];
const MESSAGE_MAX = 2000;
// Bots that fill the whole form and submit instantly land under this; a human
// reading the fields and typing a message won't.
const MIN_FILL_TIME_MS = 1200;

type FlagBody = {
  wordId?: number;
  targetTable?: string | null;
  targetId?: number | null;
  flagType?: string;
  message?: string;
  suggestedSource?: string;
  reporterName?: string;
  reporterEmail?: string;
  renderedAt?: number;
  // Honeypot: a field real users never see or fill. Any value here means a bot.
  website?: string;
};

export async function POST(request: Request) {
  let body: FlagBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Silently "succeed" for bots so they don't learn the check exists.
  if (body.website) {
    return NextResponse.json({ success: true });
  }
  if (typeof body.renderedAt !== "number" || Date.now() - body.renderedAt < MIN_FILL_TIME_MS) {
    return NextResponse.json({ success: true });
  }

  const wordId = Number(body.wordId);
  if (!Number.isInteger(wordId) || wordId <= 0) {
    return NextResponse.json({ error: "wordId is required" }, { status: 400 });
  }

  const message = (body.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }
  if (message.length > MESSAGE_MAX) {
    return NextResponse.json({ error: `message must be under ${MESSAGE_MAX} characters` }, { status: 400 });
  }

  const flagType = FLAG_TYPES.includes(body.flagType as FlagType) ? (body.flagType as FlagType) : "incorrect";

  const targetTable = TARGET_TABLES.includes(body.targetTable as FlagTargetTable)
    ? (body.targetTable as FlagTargetTable)
    : null;
  const targetId = targetTable && Number.isInteger(Number(body.targetId)) ? Number(body.targetId) : null;

  const { error } = await supabase.from("flags").insert({
    word_id: wordId,
    target_table: targetTable,
    target_id: targetId,
    flag_type: flagType,
    message: message.slice(0, MESSAGE_MAX),
    suggested_source: body.suggestedSource?.trim().slice(0, 500) || null,
    reporter_name: body.reporterName?.trim().slice(0, 200) || null,
    reporter_email: body.reporterEmail?.trim().slice(0, 200) || null,
  });

  if (error) {
    return NextResponse.json({ error: "Could not submit flag" }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
