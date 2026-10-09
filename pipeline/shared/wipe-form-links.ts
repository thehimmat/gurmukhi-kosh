// Scoped delete of the form links one source asserted (#18, #30). Shared by
// the Shackle re-ingest path (pipeline/shackle/wipe.ts) and the one-command
// takedown (pipeline/teardown.ts).

import type { supabaseAdmin } from "./db";
import { fetchAllRows } from "../../lib/fetch-all-rows";

type DB = ReturnType<typeof supabaseAdmin>;

const CHUNK = 200;

/**
 * Delete the form links a source asserted (#18): its word_forms memberships,
 * lexeme citations and relations, then the lexeme hubs it cited that nothing
 * else now uses. A hub is shared editorial ground (#30 decision 2), so one
 * another source still cites or has members in is kept; lexemes carry no
 * source_code, and the source's citation is how ownership is known.
 */
export async function wipeFormLinks(db: DB, sourceCode: string): Promise<void> {
  const cited = await fetchAllRows<{ lexeme_id: number }>("lexeme_citations(owned)", () =>
    db.from("lexeme_citations").select("lexeme_id").eq("source_code", sourceCode).order("lexeme_id")
  );
  const owned = [...new Set(cited.map((r) => r.lexeme_id))];

  for (const table of ["word_forms", "lexeme_citations", "lexeme_relations"]) {
    const { error } = await db.from(table).delete().eq("source_code", sourceCode);
    if (error) throw new Error(`wipe ${table}: ${error.message}`);
  }

  for (let i = 0; i < owned.length; i += CHUNK) {
    const ids = owned.slice(i, i + CHUNK);
    const inUse = new Set<number>();
    for (const [table, col] of [
      ["word_forms", "lexeme_id"],
      ["lexeme_citations", "lexeme_id"],
      ["lexeme_relations", "from_lexeme_id"],
      ["lexeme_relations", "to_lexeme_id"],
    ] as const) {
      const rows = await fetchAllRows<Record<string, number>>(`${table}(in use)`, () =>
        db.from(table).select(col).in(col, ids).order(col)
      );
      for (const r of rows) inUse.add(r[col]);
    }
    const empty = ids.filter((id) => !inUse.has(id));
    if (!empty.length) continue;
    const { error } = await db.from("lexemes").delete().in("id", empty);
    if (error) throw new Error(`wipe lexemes: ${error.message}`);
  }
}
