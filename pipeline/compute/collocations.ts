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
 * Page through an entire table with .range(). Supabase caps each response at
 * ~1000 rows, so a bare .select() silently truncates large tables — this loops
 * until a short page is returned.
 */
async function fetchAllRows<T>(
  build: () => any,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all;
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
 * Main job: compute bigrams + collocations for the whole corpus.
 * Fetches every word occurrence (paginated), groups by line, tallies pairs and
 * per-word frequencies in one pass, then upserts bigrams (count ≥ 3) and the
 * top collocations (PMI, count ≥ 5). Lazy-loads the Supabase client.
 */
export async function computeCollocationsCorpusWide() {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log('Fetching all word occurrences (paginated)...');
  const occs = await fetchAllRows<Occurrence>(() =>
    supabase
      .from('word_occurrences')
      .select('word_id, line_id, position')
      .order('line_id', { ascending: true })
      .order('position', { ascending: true })
  );
  console.log(`Fetched ${occs.length} occurrences across the corpus.`);

  // Group by line (rows arrive ordered by line_id, position) and tally per-word
  // frequencies + total token count in the same pass.
  const byLine = new Map<number, WordPosition[]>();
  const wordFreqs = new Map<number, number>();
  for (const o of occs) {
    let arr = byLine.get(o.line_id);
    if (!arr) { arr = []; byLine.set(o.line_id, arr); }
    arr.push({ word_id: o.word_id, position: o.position });
    wordFreqs.set(o.word_id, (wordFreqs.get(o.word_id) || 0) + 1);
  }
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

  console.log('Refreshing computed stats...');
  const { error: refreshError } = await supabase.rpc('refresh_computed_stats');
  if (refreshError) throw refreshError;
  console.log('Done.');
}
