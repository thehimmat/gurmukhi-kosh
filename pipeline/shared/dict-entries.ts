/**
 * Loads a dictionary's entries into `dict_entries` (migration 070, plan Phase 0) as SQL, so a load
 * runs the same way through the Supabase MCP `execute_sql`, `psql`, or a PGlite test.
 *
 * A source adapter turns its raw data into DictEntry rows; this module does the rest:
 *   1. delete the source's entries that are no longer in the data (their links cascade);
 *   2. upsert the rest by entry_ref, in batches, so ids and refs survive a re-run;
 *   3. drop unreviewed auto-links whose headword no longer matches;
 *   4. propose links to Kosh words (link_dict_entries).
 * Afterwards, dictEntriesVerifySql compares what landed with entriesChecksum.
 *
 * Teardown stays per source: `npm run teardown -- --source=<code>` removes the entries too.
 */
import { createHash } from "node:crypto";
import { foldGurmukhi } from "../../lib/gurmukhi-fold";

export type DictEntry = {
  entry_ref: string;
  seq?: number | null;
  page?: string | null;
  headword_native: string;
  script: string;
  headword_gurmukhi: string | null;
  body_raw: string;
  parsed?: unknown;
  ocr_confidence?: number | null;
  source_url?: string | null;
};

const CODE = /^[a-z0-9_]+$/;

/** `<code>:<key>`. The key is whatever the source keeps stable (a headword and number, or its own id). */
export function entryRef(code: string, key: string): string {
  if (!CODE.test(code)) throw new Error(`bad source code: ${code}`);
  if (!key.trim()) throw new Error(`empty entry key for ${code}`);
  return `${code}:${key}`;
}

// Unit and record separators (chr(31), chr(30) in dictEntriesVerifySql).
const US = String.fromCharCode(31);
const RS = String.fromCharCode(30);

const byBytes = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));

/** md5 over the entries' refs and bodies in byte order; matches dictEntriesVerifySql. */
export function entriesChecksum(entries: Pick<DictEntry, "entry_ref" | "body_raw">[]): string {
  const joined = entries
    .map((e) => `${e.entry_ref}${US}${e.body_raw}`)
    .sort(byBytes)
    .join(RS);
  return createHash("md5").update(joined, "utf8").digest("hex");
}

const q = (s: string | null | undefined) => (s == null ? "null" : `'${s.replaceAll("'", "''")}'`);
const num = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "null" : String(n));
const source = (code: string) => `(select id from dict_sources where code = ${q(code)})`;

export function dictEntriesLoadSql(
  code: string,
  entries: DictEntry[],
  opts: { batchSize?: number } = {},
): { statements: string[]; checksum: string } {
  const prefix = entryRef(code, "x").slice(0, -1);
  const seen = new Set<string>();
  for (const e of entries) {
    if (!e.entry_ref.startsWith(prefix) || e.entry_ref.length === prefix.length) {
      throw new Error(`entry_ref ${e.entry_ref} must start with ${prefix}`);
    }
    if (seen.has(e.entry_ref)) throw new Error(`duplicate entry_ref ${e.entry_ref}`);
    seen.add(e.entry_ref);
  }
  const src = source(code);
  const statements: string[] = [];

  statements.push(
    entries.length === 0
      ? `delete from dict_entries where dict_source_id = ${src};`
      : `delete from dict_entries where dict_source_id = ${src}\n  and not (entry_ref = any(array[${entries.map((e) => q(e.entry_ref)).join(", ")}]::text[]));`,
  );

  const size = opts.batchSize ?? 500;
  for (let i = 0; i < entries.length; i += size) {
    const rows = entries.slice(i, i + size).map((e) => {
      const fold = e.headword_gurmukhi ? foldGurmukhi(e.headword_gurmukhi) || null : null;
      const parsed = e.parsed === undefined ? null : JSON.stringify(e.parsed);
      return `(${[
        q(e.entry_ref), num(e.seq), q(e.page), q(e.headword_native), q(e.script), q(e.headword_gurmukhi),
        q(fold), q(e.body_raw), q(parsed), num(e.ocr_confidence), q(e.source_url),
      ].join(", ")})`;
    });
    statements.push(`insert into dict_entries (dict_source_id, entry_ref, seq, page, headword_native, script,
  headword_gurmukhi, search_fold, body_raw, parsed, ocr_confidence, source_url)
select ${src}, v.entry_ref, v.seq::int, v.page, v.headword_native, v.script, v.headword_gurmukhi, v.search_fold,
  v.body_raw, v.parsed::jsonb, v.ocr_confidence::real, v.source_url
from (values
${rows.join(",\n")}
) v(entry_ref, seq, page, headword_native, script, headword_gurmukhi, search_fold, body_raw, parsed, ocr_confidence, source_url)
on conflict (entry_ref) do update set
  seq = excluded.seq, page = excluded.page, headword_native = excluded.headword_native, script = excluded.script,
  headword_gurmukhi = excluded.headword_gurmukhi, search_fold = excluded.search_fold, body_raw = excluded.body_raw,
  parsed = excluded.parsed, ocr_confidence = excluded.ocr_confidence, source_url = excluded.source_url,
  updated_at = now();`);
  }

  // An unreviewed auto-link whose entry no longer matches its word goes; reviewed links stay.
  statements.push(`delete from dict_entry_links l using dict_entries e, words w
 where l.entry_id = e.id and w.id = l.word_id and e.dict_source_id = ${src}
   and l.review_status = 'unreviewed' and l.match_method in ('exact', 'fold')
   and not coalesce(
     (l.match_method = 'exact' and w.gurmukhi = e.headword_gurmukhi)
     or (l.match_method = 'fold' and w.search_fold = e.search_fold
         and not exists (select 1 from words x where x.gurmukhi = e.headword_gurmukhi)),
     false);`);

  statements.push(`select link_dict_entries(${q(code)});`);
  return { statements, checksum: entriesChecksum(entries) };
}

/** Row count and checksum of what a source has in dict_entries, to compare with entriesChecksum. */
export function dictEntriesVerifySql(code: string): string {
  return `select count(*)::int as n,
  coalesce(md5(string_agg(entry_ref || chr(31) || body_raw, chr(30) order by entry_ref || chr(31) || body_raw collate "C")), md5('')) as checksum
from dict_entries where dict_source_id = ${source(code)}`;
}
