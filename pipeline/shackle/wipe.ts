// Scoped reset of one dictionary source: the idempotent re-ingest path and the
// takedown procedure (#39). Kept out of ingest.ts so it can be tested.

import type { supabaseAdmin } from "../shared/db";

type DB = ReturnType<typeof supabaseAdmin>;

/**
 * Delete everything a source contributed. Words it created as off-corpus
 * lemmas are deleted only while still off-corpus: once a corpus attests one
 * (the Sarbloh ingest attached occurrences to 364 of Shackle's), it belongs
 * to the corpus, a FK from word_occurrences protects it, and the re-ingest
 * attaches to it by its Gurmukhi like any other corpus word.
 */
export async function wipeSource(db: DB, sourceId: number, sourceCode: string): Promise<void> {
  const steps: [string, () => PromiseLike<{ error: { message: string } | null }>][] = [
    ["dict_examples", () => db.from("dict_examples").delete().eq("dict_source_id", sourceId)],
    ["word_grammar", () => db.from("word_grammar").delete().eq("source_code", sourceCode)],
    ["etymology", () => db.from("etymology").delete().eq("source_code", sourceCode)],
    ["definitions", () => db.from("definitions").delete().eq("dict_source_id", sourceId)],
    ["words(off-corpus)", () => db.from("words").delete().eq("origin_source", sourceCode).eq("in_corpus", false)],
  ];
  for (const [name, run] of steps) {
    const { error } = await run();
    if (error) throw new Error(`wipe ${name}: ${error.message}`);
  }
}
