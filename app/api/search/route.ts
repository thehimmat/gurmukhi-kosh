import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "20"), 50);

  if (!q) return NextResponse.json({ words: [] });

  // Exact prefix match first, then similarity fallback
  const { data, error } = await supabase
    .from("words")
    .select("id, gurmukhi, frequency")
    .ilike("gurmukhi", `${q}%`)
    .order("frequency", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If prefix match returns nothing, try trigram similarity
  if (!data || data.length === 0) {
    const { data: fuzzy, error: fuzzyErr } = await supabase
      .from("words")
      .select("id, gurmukhi, frequency")
      .ilike("gurmukhi", `%${q}%`)
      .order("frequency", { ascending: false })
      .limit(limit);

    if (fuzzyErr) return NextResponse.json({ error: fuzzyErr.message }, { status: 500 });
    return NextResponse.json({ words: fuzzy ?? [] });
  }

  return NextResponse.json({ words: data });
}
