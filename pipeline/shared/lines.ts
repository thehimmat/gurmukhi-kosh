/**
 * Resolve a corpus's verse ids to our `lines.id`, scoped to one source.
 *
 * `lines.verse_id` is unique only per source — the table's constraint is
 * UNIQUE(source_fk, verse_id) — and since the Sri Sarbloh ingest (#162) the
 * ranges genuinely overlap: source_fk 4 covers verse_id 1-36,000, the same span
 * as SGGS, and all four corpora carry source_id 'G', so that column does not
 * disambiguate either.
 *
 * A lookup filtering on verse_id alone therefore returns two rows per verse, and
 * building a Map<verse_id, line_id> from that result silently keeps whichever
 * row arrived last. There is no error: data is simply attached to the wrong
 * corpus's line. Routing the lookup through this helper makes the source scope
 * non-optional, so a caller cannot forget it.
 *
 * `build` must return a FRESH query on every call (PostgREST builders are
 * single-use). Requests are chunked because a long `.in()` list both risks the
 * URL length limit and runs into the silent ~1000-row read cap that has caused
 * data loss here before (see lib/fetch-all-rows.ts).
 */

type LineRow = { id: number; verse_id: number };

// Kept deliberately shallow and non-recursive: a self-referential builder type
// sends tsc into "type instantiation is excessively deep" against PostgREST's
// own generated types, the same reason lib/fetch-all-rows.ts models only the one
// method it calls.
type InQuery = {
  in(
    column: string,
    values: number[]
  ): PromiseLike<{ data: LineRow[] | null; error: { message: string } | null }>;
};

export type LineQuery = {
  eq(column: string, value: number): InQuery;
};

export async function lineIdByVerseId(
  build: () => LineQuery,
  sourceFk: number,
  verseIds: number[],
  chunkSize = 500
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  for (let i = 0; i < verseIds.length; i += chunkSize) {
    const batch = verseIds.slice(i, i + chunkSize);
    if (batch.length === 0) continue;
    const { data, error } = await build()
      .eq("source_fk", sourceFk)
      .in("verse_id", batch);
    if (error) throw new Error(`lineIdByVerseId(source ${sourceFk}): ${error.message}`);
    for (const row of data ?? []) out.set(row.verse_id, row.id);
  }
  return out;
}
