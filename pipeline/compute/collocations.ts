import { fetchAllRows } from "../../lib/fetch-all-rows";

export interface WordPosition {
  word_id: number;
  position: number;
}

export interface BigramRow {
  w1_id: number;
  w2_id: number;
}

export interface CollocationRow {
  word_a_id: number;
  word_b_id: number;
  pair_count?: number;
  pmi?: number;
  window_size?: number;
}

/**
 * Extract ordered consecutive word pairs (bigrams) from a line.
 * Position order is respected; only pairs in sequence are included.
 */
export function extractBigrams(words: WordPosition[]): BigramRow[] {
  const bigrams: BigramRow[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.push({
      w1_id: words[i].word_id,
      w2_id: words[i + 1].word_id,
    });
  }
  return bigrams;
}

/**
 * Extract unordered word pairs (collocations) within a window threshold.
 * Only pairs where |position_diff| <= window_size are included.
 * word_a_id < word_b_id (canonical order).
 */
export function extractCollocations(
  words: WordPosition[],
  windowSize: number
): CollocationRow[] {
  const collocations: CollocationRow[] = [];
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j < words.length; j++) {
      const posDiff = Math.abs(words[i].position - words[j].position);
      if (posDiff <= windowSize) {
        const word_a_id = Math.min(words[i].word_id, words[j].word_id);
        const word_b_id = Math.max(words[i].word_id, words[j].word_id);
        collocations.push({ word_a_id, word_b_id });
      }
    }
  }
  return collocations;
}

/**
 * Compute Pointwise Mutual Information (PMI):
 * PMI = log2(P(a,b) / (P(a) * P(b)))
 *      = log2(pair_count * total / (count_a * count_b))
 */
export function computePMI(params: {
  pair_count: number;
  count_a: number;
  count_b: number;
  total: number;
}): number {
  const { pair_count, count_a, count_b, total } = params;
  const ratio = (pair_count * total) / (count_a * count_b);
  return Math.log2(ratio);
}

/**
 * Filter collocations: keep top-50 per word by PMI, drop pairs with pair_count < threshold.
 * A collocation is kept if it's in the top-50 for word_a (canonical position).
 */
export function filterCollocationsByPMI(
  collocations: (CollocationRow & { pair_count: number; pmi: number })[],
  topPerWord: number = 50,
  minPairCount: number = 5
): (CollocationRow & { pair_count: number; pmi: number })[] {
  const minFiltered = collocations.filter((c) => c.pair_count >= minPairCount);

  const byWord = new Map<
    number,
    (CollocationRow & { pair_count: number; pmi: number })[]
  >();

  for (const c of minFiltered) {
    if (!byWord.has(c.word_a_id)) byWord.set(c.word_a_id, []);
    byWord.get(c.word_a_id)!.push(c);
  }

  const kept = new Set<string>();
  for (const [, colls] of byWord) {
    const topN = colls.sort((a, b) => (b.pmi ?? 0) - (a.pmi ?? 0)).slice(0, topPerWord);
    for (const c of topN) {
      const key = `${c.word_a_id}:${c.word_b_id}`;
      kept.add(key);
    }
  }

  return minFiltered.filter((c) => kept.has(`${c.word_a_id}:${c.word_b_id}`));
}

interface Occurrence {
  word_id: number;
  line_id: number;
  position: number;
}

/**
 * One page of the occurrences pairs are counted from: on public lines only (migration 069), the
 * `limit` after id `afterId`. The job runs with the service-role key, which RLS doesn't limit, so a
 * private source must be filtered here or its text would feed the public bigrams and collocations.
 * Paging by id, not offset, keeps every page as cheap as the first.
 */
export function publicOccurrences(supabase: any, afterId: number, limit: number) {
  return supabase
    .from('word_occurrences')
    .select('id, word_id, line_id, position, lines!inner(is_public)')
    .eq('lines.is_public', true)
    .gt('id', afterId)
    .order('id', { ascending: true })
    .limit(limit);
}

/** Every public occurrence, a page at a time, printing progress. */
async function fetchPublicOccurrences(supabase: any, pageSize = 1000): Promise<Occurrence[]> {
  const all: Occurrence[] = [];
  for (let after = 0; ; ) {
    const { data, error } = await publicOccurrences(supabase, after, pageSize);
    if (error) throw new Error(`word_occurrences after id ${after}: ${error.message}`);
    const page = (data ?? []) as (Occurrence & { id: number })[];
    for (const o of page) all.push({ word_id: o.word_id, line_id: o.line_id, position: o.position });
    if (all.length % 100_000 < page.length) console.log(`  ${all.length.toLocaleString('en')} occurrences...`);
    if (page.length < pageSize) return all;
    after = page[page.length - 1].id;
  }
}

/** Occurrences grouped by line, positions in order, with each word's total count. */
export function groupByLine(occs: Occurrence[]) {
  const byLine = new Map<number, WordPosition[]>();
  const wordFreqs = new Map<number, number>();
  for (const o of occs) {
    let arr = byLine.get(o.line_id);
    if (!arr) { arr = []; byLine.set(o.line_id, arr); }
    arr.push({ word_id: o.word_id, position: o.position });
    wordFreqs.set(o.word_id, (wordFreqs.get(o.word_id) || 0) + 1);
  }
  for (const arr of byLine.values()) arr.sort((a, b) => a.position - b.position);
  return { byLine, wordFreqs };
}

/** The ids of stored rows whose pair (`key`, "a:b") this run didn't produce. */
export function staleIds(stored: { id: number; key: string }[], kept: Set<string>): number[] {
  return stored.filter((r) => !kept.has(r.key)).map((r) => r.id);
}

/**
 * Delete the rows of `table` this run no longer produces: pairs from a line since corrected, or now
 * under the threshold. Upserts alone would leave them with their old counts. Runs after the upsert,
 * so the table is never empty mid-run.
 */
async function deleteStale(
  supabase: any,
  table: 'bigrams' | 'collocations',
  kept: Set<string>,
  chunk = 500
): Promise<number> {
  // An empty run means the read failed, not that every pair is gone: never empty the table on it.
  if (kept.size === 0) throw new Error(`deleteStale(${table}): this run kept no pairs; not deleting`);
  const cols = table === 'bigrams' ? 'id, a:w1_id, b:w2_id' : 'id, a:word_a_id, b:word_b_id';
  const stored = await fetchAllRows<{ id: number; a: number; b: number }>(table, () => {
    const q = supabase.from(table).select(cols).order('id', { ascending: true });
    return table === 'collocations' ? q.eq('window_size', 3) : q;
  });
  const ids = staleIds(stored.map((r) => ({ id: r.id, key: `${r.a}:${r.b}` })), kept);
  for (let i = 0; i < ids.length; i += chunk) {
    const { error } = await supabase.from(table).delete().in('id', ids.slice(i, i + chunk));
    if (error) throw error;
  }
  return ids.length;
}

/** Upsert in bounded chunks so a single request never exceeds payload limits. */
async function upsertInChunks(
  supabase: any,
  table: string,
  rows: any[],
  onConflict: string,
  chunk = 500
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await supabase
      .from(table)
      .upsert(rows.slice(i, i + chunk), { onConflict, ignoreDuplicates: false });
    if (error) throw error;
  }
}

/**
 * Main job: compute bigrams + collocations for the public corpus.
 * Fetches every word occurrence on a public line (paginated), groups by line, tallies pairs and
 * per-word frequencies in one pass, then upserts bigrams (count ≥ 3) and the
 * top collocations (PMI, count ≥ 5) and deletes the stored pairs that no longer qualify.
 * Lazy-loads the Supabase client.
 */
export async function computeCollocationsCorpusWide() {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log('Fetching word occurrences on public lines (by id, 1,000 a page)...');
  const occs = await fetchPublicOccurrences(supabase);
  console.log(`Fetched ${occs.length} occurrences across the corpus.`);

  const { byLine, wordFreqs } = groupByLine(occs);
  const totalTokens = occs.length;

  const bigramCounts = new Map<string, number>();
  const collocationCounts = new Map<string, number>();
  for (const wordPositions of byLine.values()) {
    for (const b of extractBigrams(wordPositions)) {
      const key = `${b.w1_id}:${b.w2_id}`;
      bigramCounts.set(key, (bigramCounts.get(key) || 0) + 1);
    }
    for (const c of extractCollocations(wordPositions, 3)) {
      const key = `${c.word_a_id}:${c.word_b_id}`;
      collocationCounts.set(key, (collocationCounts.get(key) || 0) + 1);
    }
  }

  // Bigrams: keep recurrent pairs (count ≥ 3) and store the count.
  const bigramBatch: Array<{ w1_id: number; w2_id: number; pair_count: number }> = [];
  for (const [key, pair_count] of bigramCounts) {
    if (pair_count < 3) continue;
    const [w1_id, w2_id] = key.split(':').map(Number);
    bigramBatch.push({ w1_id, w2_id, pair_count });
  }

  // Collocations: PMI from true corpus-wide frequencies, then top-50/word, count ≥ 5.
  const collocationWithPMI = [];
  for (const [key, pair_count] of collocationCounts) {
    const [word_a_id, word_b_id] = key.split(':').map(Number);
    const pmi = computePMI({
      pair_count,
      count_a: wordFreqs.get(word_a_id) || 1,
      count_b: wordFreqs.get(word_b_id) || 1,
      total: totalTokens,
    });
    collocationWithPMI.push({ word_a_id, word_b_id, window_size: 3, pair_count, pmi });
  }
  const filtered = filterCollocationsByPMI(collocationWithPMI, 50, 5);

  console.log(`Upserting ${bigramBatch.length} bigrams (count >= 3)...`);
  await upsertInChunks(supabase, 'bigrams', bigramBatch, 'w1_id,w2_id');

  console.log(`Upserting ${filtered.length} collocations...`);
  await upsertInChunks(supabase, 'collocations', filtered, 'word_a_id,word_b_id,window_size');

  const keptBigrams = new Set(bigramBatch.map((b) => `${b.w1_id}:${b.w2_id}`));
  console.log(`Deleted ${await deleteStale(supabase, 'bigrams', keptBigrams)} bigrams no longer counted.`);
  const keptCollocations = new Set(filtered.map((c) => `${c.word_a_id}:${c.word_b_id}`));
  console.log(`Deleted ${await deleteStale(supabase, 'collocations', keptCollocations)} collocations no longer counted.`);

  console.log('Refreshing computed stats...');
  const { error: refreshError } = await supabase.rpc('refresh_computed_stats');
  if (refreshError) throw refreshError;
  console.log('Done.');
}
