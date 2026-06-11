/**
 * Word-set lookup for pipeline scripts. Any enrichment pipeline can scope its
 * work to a named set (e.g. `--word-set=japji`) via fetchWordSet().
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface WordSetMember {
  word_id: number;
  gurmukhi: string;
  occurrence_count: number;
}

/**
 * Return the members of a word set as {word_id, gurmukhi, occurrence_count}.
 * Throws if the set does not exist or has no members (build it first with
 * `npm run wordset:build -- --set=<code>`).
 */
export async function fetchWordSet(
  db: SupabaseClient,
  code: string
): Promise<WordSetMember[]> {
  const { data: set, error: setErr } = await db
    .from("word_sets")
    .select("id, name")
    .eq("code", code)
    .single();
  if (setErr || !set) {
    throw new Error(
      `word set '${code}' not found. Build it: npm run wordset:build -- --set=${code}`
    );
  }

  const members: WordSetMember[] = [];
  const PAGE = 1000;
  let offset = 0;
  for (;;) {
    const { data, error } = await db
      .from("word_set_members")
      .select("word_id, occurrence_count, words(gurmukhi)")
      .eq("word_set_id", set.id)
      .order("occurrence_count", { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`fetchWordSet('${code}'): ${error.message}`);
    const batch = data ?? [];
    for (const row of batch as unknown as Array<{
      word_id: number;
      occurrence_count: number;
      words: { gurmukhi: string } | null;
    }>) {
      if (row.words) {
        members.push({
          word_id: row.word_id,
          gurmukhi: row.words.gurmukhi,
          occurrence_count: row.occurrence_count,
        });
      }
    }
    if (batch.length < PAGE) break;
    offset += PAGE;
  }

  if (members.length === 0) {
    throw new Error(
      `word set '${code}' has no members. Build it: npm run wordset:build -- --set=${code}`
    );
  }
  return members;
}
