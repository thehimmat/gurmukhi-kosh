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

/**
 * Main job: compute bigrams + collocations for all SGGS lines.
 * Populates bigrams and collocations tables. Lazy-loads Supabase client.
 */
export async function computeCollocationsCorpusWide() {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log('Computing bigrams and collocations for SGGS...');

  const { data: lineData, error: lineError } = await supabase
    .from('lines')
    .select('id, shabad_id')
    .limit(10000);

  if (lineError) throw lineError;

  const bigramBatch: BigramRow[] = [];
  const bigramCounts = new Map<string, number>();
  const collocationCounts = new Map<string, number>();

  for (const line of lineData || []) {
    const { data: occurrences, error: occError } = await supabase
      .from('word_occurrences')
      .select('word_id, position')
      .eq('line_id', line.id)
      .order('position', { ascending: true });

    if (occError) throw occError;

    const wordPositions = (occurrences || []).map((o: any) => ({
      word_id: o.word_id,
      position: o.position,
    }));

    const bigrams = extractBigrams(wordPositions);
    for (const b of bigrams) {
      const key = `${b.w1_id}:${b.w2_id}`;
      bigramCounts.set(key, (bigramCounts.get(key) || 0) + 1);
    }

    const collocations = extractCollocations(wordPositions, 3);
    for (const c of collocations) {
      const key = `${c.word_a_id}:${c.word_b_id}`;
      collocationCounts.set(key, (collocationCounts.get(key) || 0) + 1);
    }
  }

  for (const [key] of bigramCounts) {
    const [w1_id, w2_id] = key.split(':').map(Number);
    bigramBatch.push({ w1_id, w2_id });
  }

  const wordFreqs = await fetchWordFrequencies(supabase);
  const totalPairs = (lineData || []).length;

  const collocationWithPMI = [];
  for (const [key, pair_count] of collocationCounts) {
    const [word_a_id, word_b_id] = key.split(':').map(Number);
    const count_a = wordFreqs.get(word_a_id) || 1;
    const count_b = wordFreqs.get(word_b_id) || 1;
    const pmi = computePMI({
      pair_count,
      count_a,
      count_b,
      total: totalPairs,
    });
    collocationWithPMI.push({
      word_a_id,
      word_b_id,
      window_size: 3,
      pair_count,
      pmi,
    });
  }

  const filtered = filterCollocationsByPMI(collocationWithPMI, 50, 5);

  console.log(`Upserting ${bigramBatch.length} bigrams...`);
  if (bigramBatch.length > 0) {
    const { error: bigramError } = await supabase
      .from('bigrams')
      .upsert(bigramBatch, { onConflict: 'w1_id,w2_id', ignoreDuplicates: false });
    if (bigramError) throw bigramError;
  }

  console.log(`Upserting ${filtered.length} collocations...`);
  if (filtered.length > 0) {
    const { error: collError } = await supabase
      .from('collocations')
      .upsert(filtered, {
        onConflict: 'word_a_id,word_b_id,window_size',
        ignoreDuplicates: false,
      });
    if (collError) throw collError;
  }

  console.log('Done. Refreshing computed stats...');
  const { error: refreshError } = await supabase.rpc('refresh_computed_stats');
  if (refreshError) throw refreshError;
}

async function fetchWordFrequencies(supabase: any): Promise<Map<number, number>> {
  const { data, error } = await supabase
    .from('word_occurrences')
    .select('word_id');

  if (error) throw error;

  const freqs = new Map<number, number>();
  for (const row of data || []) {
    freqs.set(row.word_id, (freqs.get(row.word_id) || 0) + 1);
  }
  return freqs;
}
