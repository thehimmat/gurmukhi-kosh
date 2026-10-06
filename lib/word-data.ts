// Shared data-fetching for the word page (app/word/[gurmukhi]/page.tsx) and
// the JSON API (app/api/word/[gurmukhi]/route.ts). Both surfaces present the
// same word entry, so the derivations that must stay identical between them —
// morphological variants and usage partner resolution — live here once.

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase, type PosMapping } from "./supabase";
import { posMappingsFrom, type PosMap } from "./grammar-view";
import { toMorphVariants, type MorphVariant, type SiblingFormRow } from "./morph-variants";

export type { MorphVariant };

// pos_mappings (#29): every surface that builds a grammar view must compare POS
// through the same map, or the word page, /health and the autoflag pass drift.
// The table is tiny (one row per distinct raw label), so no paging is needed.
export async function fetchPosMap(db: SupabaseClient = supabase): Promise<PosMap> {
  const { data, error } = await db.from("pos_mappings").select("source_code, pos_raw, pos_norm");
  if (error) throw new Error(`fetchPosMap: ${error.message}`);
  return posMappingsFrom((data ?? []) as PosMapping[]);
}

/**
 * Sibling inflected forms of a word, across every lexeme it belongs to, from
 * source-asserted word_forms memberships only (see lib/morph-variants.ts).
 *
 * A word may hold several word_forms rows (per-source memberships and multiple
 * readings, migration 023 / #30), so this unions the sibling forms of every
 * lexeme the word is a member of, deduped.
 */
export async function fetchMorphVariants(wordId: number, word: string): Promise<MorphVariant[]> {
  const { data: memberships } = await supabase
    .from("word_forms")
    .select("lexeme_id")
    .eq("word_id", wordId)
    .not("source_code", "is", null);
  const lexemeIds = [
    ...new Set(((memberships ?? []) as Array<{ lexeme_id: number }>).map((m) => m.lexeme_id)),
  ];
  if (lexemeIds.length === 0) return [];

  const { data: formRows } = await supabase
    .from("word_forms")
    .select("source_code, label_raw, words(gurmukhi)")
    .in("lexeme_id", lexemeIds)
    .not("source_code", "is", null)
    .order("id", { ascending: true });
  return toMorphVariants((formRows ?? []) as unknown as SiblingFormRow[], word);
}

export type UsagePhrase = { w1: string | null; w2: string | null; count: number };
export type UsageCollocate = { partner: string | null; count: number; pmi: number | null };

/**
 * Bigram phrases + PMI collocations for a word, with partner word_ids resolved
 * to Gurmukhi in one follow-up query.
 */
export async function fetchUsage(
  wordId: number,
  limit = 15
): Promise<{ phrases: UsagePhrase[]; collocates: UsageCollocate[] }> {
  const [bgRes, colRes] = await Promise.all([
    supabase
      .from("bigrams")
      .select("w1_id, w2_id, pair_count")
      .or(`w1_id.eq.${wordId},w2_id.eq.${wordId}`)
      .order("pair_count", { ascending: false })
      .limit(limit),
    supabase
      .from("collocations")
      .select("word_a_id, word_b_id, pair_count, pmi")
      .or(`word_a_id.eq.${wordId},word_b_id.eq.${wordId}`)
      .order("pmi", { ascending: false })
      .limit(limit),
  ]);
  const bgRows = (bgRes.data ?? []) as Array<{ w1_id: number; w2_id: number; pair_count: number }>;
  const colRows = (colRes.data ?? []) as Array<{ word_a_id: number; word_b_id: number; pair_count: number; pmi: number | null }>;

  const partnerIds = new Set<number>();
  for (const r of bgRows) { partnerIds.add(r.w1_id); partnerIds.add(r.w2_id); }
  for (const r of colRows) { partnerIds.add(r.word_a_id); partnerIds.add(r.word_b_id); }
  const { data: partnerWords } = partnerIds.size
    ? await supabase.from("words").select("id, gurmukhi").in("id", [...partnerIds])
    : { data: [] };
  const idToGur = new Map(
    ((partnerWords ?? []) as Array<{ id: number; gurmukhi: string }>).map((w) => [w.id, w.gurmukhi])
  );

  return {
    phrases: bgRows.map((r) => ({
      w1: idToGur.get(r.w1_id) ?? null,
      w2: idToGur.get(r.w2_id) ?? null,
      count: r.pair_count,
    })),
    collocates: colRows.map((r) => {
      const partnerId = r.word_a_id === wordId ? r.word_b_id : r.word_a_id;
      return { partner: idToGur.get(partnerId) ?? null, count: r.pair_count, pmi: r.pmi };
    }),
  };
}

// writer_english requires migration 008; until applied this errors and
// degrades to an empty list (only .data is read).
export async function fetchWriterStats(
  wordId: number,
  limit: number
): Promise<Array<{ writer_english: string | null; occurrence_count: number }>> {
  const { data } = await supabase
    .from("word_writer_stats")
    .select("writer_english, occurrence_count")
    .eq("word_id", wordId)
    .order("occurrence_count", { ascending: false })
    .limit(limit);
  return (data ?? []) as Array<{ writer_english: string | null; occurrence_count: number }>;
}
