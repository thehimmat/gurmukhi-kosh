import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { foldGurmukhi } from "@/lib/gurmukhi-fold";
import {
  DEFAULT_NUMERAL_ROLES,
  NUMERAL_ROLES,
  isNumericQuery,
  normalizeNumericQuery,
  type NumeralRole,
} from "@/lib/gurmukhi-numerals";

// Each hit carries how it matched, so consumers can present fuzzy hits as
// fuzzy: "prefix" (exact prefix on the spelling), "fold" (prefix on the
// lossy search_fold key — #63), "contains" (substring, last resort).
type SearchHit = { id: number; gurmukhi: string; frequency: number; match: "prefix" | "fold" | "contains" };

type LineRow = {
  id: number;
  ang: number;
  line_no: number;
  gurmukhi: string;
  corpus_rank: number | null;
  sources: { code: string; name: string } | null;
  shabads: { raag_english: string | null; writer_english: string | null } | null;
};

type NumeralRow = {
  value: number;
  role: NumeralRole;
  keyword: string | null;
  char_start: number;
  char_end: number;
  lines: LineRow | null;
};

/** Parses the `roles` param; falls back to the default (headings, no tallies). */
function parseRoles(raw: string | null): NumeralRole[] {
  if (raw === null) return [...DEFAULT_NUMERAL_ROLES];
  const asked = raw
    .split(",")
    .map((r) => r.trim())
    .filter((r): r is NumeralRole => (NUMERAL_ROLES as readonly string[]).includes(r));
  // An explicit empty selection means "show nothing", not "show the default" —
  // unchecking every box in the UI must not silently re-check them.
  return asked;
}

/**
 * Number search: numerals are not words (see migration 032), so a digits-only
 * query is answered from number_occurrences as a list of LINES, filtered by
 * the role the numeral plays. Verse tallies are excluded unless asked for.
 */
async function searchNumbers(req: NextRequest, q: string) {
  const value = normalizeNumericQuery(q);
  if (value === null) return NextResponse.json({ mode: "number", value: null, counts: {}, lines: [] });

  const roles = parseRoles(req.nextUrl.searchParams.get("roles"));
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "30"), 100);

  // Per-role totals for this value, so the checkboxes can be labelled with
  // their counts and a role with no hits can be disabled rather than dead.
  const countEntries = await Promise.all(
    NUMERAL_ROLES.map(async (role) => {
      const { count } = await supabase
        .from("number_occurrences")
        .select("id", { count: "exact", head: true })
        .eq("value", value)
        .eq("role", role);
      return [role, count ?? 0] as const;
    })
  );
  const counts = Object.fromEntries(countEntries) as Record<NumeralRole, number>;

  if (roles.length === 0) {
    return NextResponse.json({ mode: "number", value, roles, counts, lines: [] });
  }

  // Ordered by line_id: it is indexed, stable across pages, and already close
  // to reading order (SGGS holds the lowest ids). The page is then sorted into
  // true corpus reading order (migration 031) below for display.
  const { data, error } = await supabase
    .from("number_occurrences")
    .select(
      "value, role, keyword, char_start, char_end, " +
        "lines!inner(id, ang, line_no, gurmukhi, corpus_rank, sources(code, name), shabads(raag_english, writer_english))"
    )
    .eq("value", value)
    .in("role", roles)
    .order("line_id")
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const lines = ((data ?? []) as unknown as NumeralRow[])
    .filter((r) => r.lines !== null)
    .map((r) => ({
      lineId: r.lines!.id,
      ang: r.lines!.ang,
      lineNo: r.lines!.line_no,
      gurmukhi: r.lines!.gurmukhi,
      corpusRank: r.lines!.corpus_rank ?? 100,
      sourceCode: r.lines!.sources?.code ?? null,
      sourceName: r.lines!.sources?.name ?? null,
      raag: r.lines!.shabads?.raag_english ?? null,
      writer: r.lines!.shabads?.writer_english ?? null,
      role: r.role,
      keyword: r.keyword,
      charStart: r.char_start,
      charEnd: r.char_end,
    }))
    .sort(
      (a, b) =>
        a.corpusRank - b.corpusRank || a.ang - b.ang || a.lineNo - b.lineNo
    );

  return NextResponse.json({ mode: "number", value, roles, counts, lines });
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "20"), 50);

  if (!q) return NextResponse.json({ words: [] });

  // A digits-only query means the number itself, not a word spelled with
  // digits, so it takes the number path instead of the dictionary path.
  if (isNumericQuery(q)) return searchNumbers(req, q);

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
