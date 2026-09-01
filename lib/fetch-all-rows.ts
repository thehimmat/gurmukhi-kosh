/**
 * Fetch every row of a PostgREST query by paging with .range().
 *
 * Supabase/PostgREST silently caps any unpaginated read at ~1000 rows — no
 * error, just a short result — which has repeatedly caused silent data loss
 * in this project (padarth ingest, word-set builder, grammar ingest, #100).
 * Any query that can plausibly return more than 1000 rows must go through
 * this helper (or hand-page the same way, e.g. streaming loops that process
 * page-by-page instead of accumulating).
 *
 * `build` must return a FRESH query on every call (PostgREST builders are
 * single-use) and must include a stable `.order()` on a unique column (or
 * end with one, e.g. `.order("id")`) so page boundaries cannot shift between
 * requests.
 */

type PageResult = {
  data: unknown[] | null;
  error: { message: string } | null;
};

type RangeQuery = {
  range(from: number, to: number): PromiseLike<PageResult>;
};

export async function fetchAllRows<T>(
  label: string,
  build: () => RangeQuery,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw new Error(`fetchAllRows(${label}): ${error.message}`);
    const batch = (data ?? []) as T[];
    all.push(...batch);
    if (batch.length < pageSize) break;
  }
  return all;
}
