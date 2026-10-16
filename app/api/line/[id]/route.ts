/**
 * GET /api/line/[id]?scope=passage|ang
 *
 * The line viewer's context as JSON: the line with its shabad (or bani passage,
 * or whole ang), each line's translations and commentaries, and the previous /
 * next passage. Used by the santhya transcriber's lookup aside to correct the
 * lines a class is citing.
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchLineContext, lineContextJson, type Scope } from "@/lib/line-context";

type Params = { params: Promise<{ id: string }> };

// Lines change only when an ingest runs (as /api/word).
const CDN_CACHE = "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800";

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Line id must be a number" }, { status: 400 });
  const scope: Scope = req.nextUrl.searchParams.get("scope") === "ang" ? "ang" : "passage";
  const ctx = await fetchLineContext(Number(id), scope);
  if (!ctx) return NextResponse.json({ error: "Line not found" }, { status: 404 });
  return NextResponse.json(lineContextJson(ctx), { headers: { "Cache-Control": CDN_CACHE } });
}
