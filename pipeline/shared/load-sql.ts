/**
 * SQL that loads a built corpus (lines with their own verse ids, e.g. pipeline/nand-lal/build.ts) into
 * `lines`, `words` and `word_occurrences`, for when Supabase is reachable only through SQL (the MCP
 * `execute_sql`), as for the Sarbloh load. Tokens come from lib/tokenizer, so the counts match the
 * TypeScript ingest exactly. The source row and its `shabads` rows must exist first (a migration adds
 * them). Re-running is a no-op: every insert is `on conflict do nothing`.
 *
 * Afterwards run refresh_word_frequencies, refresh_word_corpus_stats, refresh_word_corpus_writer_stats
 * and refresh_line_first_letters, as pipeline/sggs/ingest.ts does.
 */

import { tokenize } from "../../lib/tokenizer";

export type LoadLine = { verse_id: number; ang: number; line_no: number; shabad_id: number | null; gurmukhi: string };

const q = (s: string) => `'${s.replaceAll("'", "''")}'`;

export function linesLoadSql(sourceCode: string, lines: LoadLine[]): { sql: string; tokens: number; distinct: number } {
  const source = `(select id from sources where code = ${q(sourceCode)})`;
  const occurrences = lines.flatMap((l) => tokenize(l.gurmukhi).map((t, pos) => `(${l.verse_id}, ${pos}, ${q(t)})`));
  const words = [...new Set(lines.flatMap((l) => tokenize(l.gurmukhi)))];

  const sql = `insert into lines (source_fk, verse_id, shabad_id, ang, line_no, gurmukhi)
select ${source}, v.verse_id, v.shabad_id, v.ang, v.line_no, v.gurmukhi
from (values
${lines.map((l) => `(${l.verse_id}, ${l.shabad_id ?? "null"}, ${l.ang}, ${l.line_no}, ${q(l.gurmukhi)})`).join(",\n")}
) v(verse_id, shabad_id, ang, line_no, gurmukhi)
on conflict (source_fk, verse_id) do nothing;

insert into words (gurmukhi, frequency)
select t, 0 from (values
${words.map((w) => `(${q(w)})`).join(",\n")}
) x(t)
on conflict (gurmukhi) do nothing;

insert into word_occurrences (word_id, line_id, position)
select w.id, l.id, o.position
from (values
${occurrences.join(",\n")}
) o(verse_id, position, token)
join lines l on l.source_fk = ${source} and l.verse_id = o.verse_id
join words w on w.gurmukhi = o.token
on conflict do nothing;
`;
  return { sql, tokens: occurrences.length, distinct: words.length };
}
