/**
 * Load a built corpus (lines with their own verse ids, e.g. pipeline/gur-sobha/build.ts) into
 * `lines`, `words` and `word_occurrences` through the REST API with the service key: the twin of
 * load-sql.ts linesLoadSql, for when the database is reachable over HTTP but not by raw SQL. Same
 * tokens (lib/tokenizer through `wordText`), same rows, and re-running is a no-op: every write is
 * an upsert that ignores rows already there. The source row and its `shabads` rows must exist
 * first (a migration adds them).
 *
 * Afterwards run refresh_word_frequencies, refresh_word_corpus_stats,
 * refresh_word_corpus_writer_stats and refresh_line_first_letters, as pipeline/sggs/ingest.ts does.
 */

import { tokenize } from "../../lib/tokenizer";
import { fetchAllRows } from "../../lib/fetch-all-rows";
import { chunk } from "../word-sets/aggregate";
import type { LoadLine } from "./load-sql";

type Result<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;
type Query = {
  select(cols: string): Query;
  eq(col: string, v: unknown): Query;
  in(col: string, vs: unknown[]): Query;
  order(col: string, opts?: { ascending: boolean }): Query;
  range(from: number, to: number): Result<unknown[]>;
  single(): Result<Record<string, unknown>>;
  upsert(rows: object[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }): PromiseLike<{ error: { message: string } | null }>;
};
/** The slice of a Supabase client the loader uses. */
export type LoadDb = { from(table: string): Query };

// Writes of 500 rows keep each request well under PostgREST's body limit; reads by `.in()` go 100
// headwords at a time, since a long list of Unicode words overflows the GET URL (verify/occurrences.ts).
const WRITE = 500;
const IN_LIST = 100;

export async function loadLines(
  db: LoadDb,
  sourceCode: string,
  lines: LoadLine[],
  wordText: (line: string) => string = (line) => line,
): Promise<{ lines: number; words: number; occurrences: number }> {
  const { data: source, error: sourceErr } = await db.from("sources").select("id").eq("code", sourceCode).single();
  if (sourceErr || !source) throw new Error(`source ${sourceCode} is not registered: ${sourceErr?.message ?? "no row"}`);
  const sourceFk = source.id as number;

  for (const batch of chunk(lines, WRITE)) {
    const rows = batch.map((l) => ({
      source_fk: sourceFk, verse_id: l.verse_id, shabad_id: l.shabad_id, ang: l.ang, line_no: l.line_no, gurmukhi: l.gurmukhi,
    }));
    const { error } = await db.from("lines").upsert(rows, { onConflict: "source_fk,verse_id", ignoreDuplicates: true });
    if (error) throw new Error(`line upsert: ${error.message}`);
  }
  const lineRows = await fetchAllRows<{ id: number; verse_id: number }>("lines", () =>
    db.from("lines").select("id, verse_id").eq("source_fk", sourceFk).order("id", { ascending: true }),
  );
  const lineId = new Map(lineRows.map((l) => [l.verse_id, l.id]));

  const tokensOf = new Map(lines.map((l) => [l.verse_id, tokenize(wordText(l.gurmukhi))]));
  const distinct = [...new Set([...tokensOf.values()].flat())];
  for (const batch of chunk(distinct, WRITE)) {
    const { error } = await db
      .from("words")
      .upsert(batch.map((g) => ({ gurmukhi: g, frequency: 0 })), { onConflict: "gurmukhi", ignoreDuplicates: true });
    if (error) throw new Error(`word upsert: ${error.message}`);
  }
  const wordId = new Map<string, number>();
  for (const batch of chunk(distinct, IN_LIST)) {
    const rows = await fetchAllRows<{ id: number; gurmukhi: string }>("words", () =>
      db.from("words").select("id, gurmukhi").in("gurmukhi", batch).order("id", { ascending: true }),
    );
    for (const w of rows) wordId.set(w.gurmukhi, w.id);
  }

  const occurrences = lines.flatMap((l) =>
    tokensOf.get(l.verse_id)!.map((t, position) => {
      const word = wordId.get(t);
      const line = lineId.get(l.verse_id);
      if (word === undefined || line === undefined) throw new Error(`verse ${l.verse_id}: '${t}' did not resolve`);
      return { word_id: word, line_id: line, position };
    }),
  );
  for (const batch of chunk(occurrences, WRITE)) {
    const { error } = await db
      .from("word_occurrences")
      .upsert(batch, { onConflict: "word_id,line_id,position", ignoreDuplicates: true });
    if (error) throw new Error(`occurrence upsert: ${error.message}`);
  }

  return { lines: lines.length, words: distinct.length, occurrences: occurrences.length };
}
