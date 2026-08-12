import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { foldGurmukhi } from "@/lib/gurmukhi-fold";

// Each hit carries how it matched, so consumers can present fuzzy hits as
// fuzzy: "prefix" (exact prefix on the spelling), "fold" (prefix on the
// lossy search_fold key — #63), "contains" (substring, last resort).
type SearchHit = { id: number; gurmukhi: string; frequency: number; match: "prefix" | "fold" | "contains" };

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "20"), 50);

  if (!q) return NextResponse.json({ words: [] });

  const hits: SearchHit[] = [];
  const seen = new Set<number>();

  // Tier 1: exact prefix on the spelling as typed.
  const { data: prefix, error } = await supabase
    .from("words")
    .select("id, gurmukhi, frequency")
    .ilike("gurmukhi", `${q}%`)
    .order("frequency", { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  for (const w of prefix ?? []) {
    hits.push({ ...w, match: "prefix" });
    seen.add(w.id);
  }

  // Tier 2: prefix on the folded key — catches dental/retroflex, nukta,
  // vowel-length, and final-matra variants of what was typed. Ranked below
  // every exact-prefix hit.
  if (hits.length < limit) {
    const folded = foldGurmukhi(q);
    if (folded) {
      const { data: foldHits } = await supabase
        .from("words")
        .select("id, gurmukhi, frequency")
        .like("search_fold", `${folded}%`)
        .order("frequency", { ascending: false })
        .limit(limit);
      for (const w of foldHits ?? []) {
        if (seen.has(w.id) || hits.length >= limit) continue;
        hits.push({ ...w, match: "fold" });
        seen.add(w.id);
      }
    }
  }

  // Tier 3: substring, only when nothing else matched at all (pre-#63
  // behavior preserved as the last resort).
  if (hits.length === 0) {
    const { data: contains, error: containsErr } = await supabase
      .from("words")
      .select("id, gurmukhi, frequency")
      .ilike("gurmukhi", `%${q}%`)
      .order("frequency", { ascending: false })
      .limit(limit);
    if (containsErr) return NextResponse.json({ error: containsErr.message }, { status: 500 });
    for (const w of contains ?? []) hits.push({ ...w, match: "contains" });
  }

  return NextResponse.json({ words: hits });
}
