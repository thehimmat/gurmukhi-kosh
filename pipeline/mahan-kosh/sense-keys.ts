/**
 * The definitions upsert key is (word_id, dict_source_id, sense_number), so
 * two rows sharing it in one batch fail the upsert, and a silent dedupe
 * drops a sense (#159). Lists every repeated (word, sense) with its count.
 */
export function duplicateSenseKeys(
  rows: { word_id: number; sense_number: number; entry_gurmukhi: string | null }[]
): string[] {
  const counts = new Map<string, { row: (typeof rows)[number]; n: number }>();
  for (const r of rows) {
    const key = `${r.word_id}:${r.sense_number}`;
    const seen = counts.get(key);
    if (seen) seen.n++;
    else counts.set(key, { row: r, n: 1 });
  }
  return [...counts.values()]
    .filter(({ n }) => n > 1)
    .map(({ row, n }) => {
      const word = row.entry_gurmukhi ? `${row.entry_gurmukhi} (word ${row.word_id})` : `word ${row.word_id}`;
      return `${word} sense ${row.sense_number} ×${n}`;
    });
}
