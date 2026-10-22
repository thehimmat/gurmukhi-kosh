/**
 * GET /api/line/[id]?scope=passage|ang
 *
 * The line viewer's context as JSON: the line with its shabad (or bani passage,
 * or whole ang), each line's translations and commentaries, and the previous /
 * next passage. Used by the santhya transcriber's lookup aside to correct the
 * lines a class is citing.
 *
 * With ?key=ADMIN_KEY (curator mode) it also returns curator-only commentaries
 * (#258, migration 069), read through the service role and never cached.
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchLineContext, lineContextJson, type Scope } from "@/lib/line-context";
import { curatorDb, isCurator } from "@/lib/curator";

type Params = { params: Promise<{ id: string }> };

// Lines change only when an ingest runs (as /api/word).
const CDN_CACHE = "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800";

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Line id must be a number" }, { status: 400 });
  const scope: Scope = req.nextUrl.searchParams.get("scope") === "ang" ? "ang" : "passage";
  const curator = isCurator(req.nextUrl.searchParams.get("key"));
  const ctx = await fetchLineContext(Number(id), scope, curatorDb(curator));
  if (!ctx) return NextResponse.json({ error: "Line not found" }, { status: 404 });
  // A curator response holds curator-only text: never let a CDN keep it.
  const cache = curator ? "private, no-store" : CDN_CACHE;
  return NextResponse.json(lineContextJson(ctx), { headers: { "Cache-Control": cache } });
}
