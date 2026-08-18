/**
 * Audit (and optionally repair) word_occurrences completeness.
 *
 * Usage (from gurmukhi-kosh project root):
 *   npm run verify:occurrences           # report only
 *   npm run verify:occurrences -- --fix  # insert the missing occurrences
 *
 * Why this exists: the corpus ingest resolves each token to a word_id via a
 * lookup map and silently drops tokens the map misses
 * (`.filter(Boolean)`), while occurrence-insert errors are logged and
 * stepped over. A transient failure mid-run therefore costs occurrences
 * with no signal — the Dasam Bani run (#70) lost a handful that way, and
 * they were only found by accident. This re-derives the expected
 * occurrences from lines.gurmukhi with the real tokenizer and compares.
 *
 * Idempotent: --fix upserts words then occurrences, both conflict-safe.
 * Run after every corpus ingest; expected output is 0 missing.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { supabaseAdmin } from "../shared/db";
import { tokenize } from "../../lib/tokenizer";
import { progress } from "../shared/utils";

const LINE_PAGE = 500;

type LineRow = { id: number; gurmukhi: string; source_fk: number };

async function main() {
  const fix = process.argv.includes("--fix");
  const db = supabaseAdmin();

  const { data: sourceRows } = await db.from("sources").select("id, code");
  const sourceName = new Map((sourceRows ?? []).map((s) => [s.id as number, s.code as string]));

  const missingBySource = new Map<number, number>();
  const linesShort = new Map<number, number>();
  let scanned = 0;
  let inserted = 0;
  const t0 = Date.now();

  for (let offset = 0; ; offset += LINE_PAGE) {
    const { data: lines, error } = await db
      .from("lines")
      .select("id, gurmukhi, source_fk")
      .order("id", { ascending: true })
      .range(offset, offset + LINE_PAGE - 1);
    if (error) throw new Error(`lines fetch: ${error.message}`);
    const batch = (lines ?? []) as LineRow[];
    if (batch.length === 0) break;

    // Expected (token, position) pairs per line.
    const expected = new Map<number, string[]>();
    for (const l of batch) expected.set(l.id, tokenize(l.gurmukhi ?? ""));

    // MUST paginate: PostgREST caps an unpaginated read at 1000 rows with no
    // error, and a 500-line batch holds several thousand occurrences — an
    // unpaginated fetch reports nearly every existing row as "missing".
    const havePositions = new Map<number, Set<number>>();
    const lineIds = batch.map((l) => l.id);
    for (let occOffset = 0; ; occOffset += 1000) {
      const { data: occRows, error: occErr } = await db
        .from("word_occurrences")
        .select("line_id, position")
        .in("line_id", lineIds)
        .order("id", { ascending: true })
        .range(occOffset, occOffset + 999);
      if (occErr) throw new Error(`occurrences fetch: ${occErr.message}`);
      const occBatch = (occRows ?? []) as { line_id: number; position: number }[];
      for (const o of occBatch) {
        if (!havePositions.has(o.line_id)) havePositions.set(o.line_id, new Set());
        havePositions.get(o.line_id)!.add(o.position);
      }
      if (occBatch.length < 1000) break;
    }

    // Gaps: an expected position with no occurrence row.
    const gaps: { line: LineRow; position: number; token: string }[] = [];
    for (const l of batch) {
      const tokens = expected.get(l.id)!;
      const have = havePositions.get(l.id) ?? new Set<number>();
      let shortHere = 0;
      tokens.forEach((token, position) => {
        if (!have.has(position)) {
          gaps.push({ line: l, position, token });
          shortHere++;
        }
      });
      if (shortHere > 0) {
        missingBySource.set(l.source_fk, (missingBySource.get(l.source_fk) ?? 0) + shortHere);
        linesShort.set(l.source_fk, (linesShort.get(l.source_fk) ?? 0) + 1);
      }
    }

    if (fix && gaps.length > 0) {
      const tokens = [...new Set(gaps.map((g) => g.token))];
      const { error: wErr } = await db
        .from("words")
        .upsert(tokens.map((g) => ({ gurmukhi: g, frequency: 0 })), { onConflict: "gurmukhi", ignoreDuplicates: true });
      if (wErr) throw new Error(`word upsert: ${wErr.message}`);

      const { data: wordRows, error: wfErr } = await db.from("words").select("id, gurmukhi").in("gurmukhi", tokens);
      if (wfErr) throw new Error(`word fetch: ${wfErr.message}`);
      const wordId = new Map((wordRows ?? []).map((w) => [w.gurmukhi as string, w.id as number]));

      // Unlike the ingest, an unresolvable token is a hard error rather than
      // a silent skip — that silence is the bug this script exists to catch.
      const rows = gaps.map((g) => {
        const id = wordId.get(g.token);
        if (!id) throw new Error(`token '${g.token}' (line ${g.line.id}) did not resolve to a word row`);
        return { word_id: id, line_id: g.line.id, position: g.position };
      });

      const { error: insErr } = await db.from("word_occurrences").upsert(rows, { ignoreDuplicates: true });
      if (insErr) throw new Error(`occurrence insert: ${insErr.message}`);
      inserted += rows.length;
    }

    scanned += batch.length;
    if (scanned % 10000 === 0) progress(scanned, scanned, t0, "Lines ");
    if (batch.length < LINE_PAGE) break;
  }

  console.log(`\nScanned ${scanned.toLocaleString()} lines.`);
  if (missingBySource.size === 0) {
    console.log("No missing occurrences. Corpus is complete.");
  } else {
    for (const [sourceFk, missing] of missingBySource) {
      console.log(`  ${sourceName.get(sourceFk) ?? sourceFk}: ${missing} missing across ${linesShort.get(sourceFk)} lines`);
    }
    if (fix) {
      console.log(`Inserted ${inserted} occurrence rows. Re-run the frequency refreshes:`);
      console.log("  select refresh_word_frequencies(); select refresh_word_corpus_stats();");
    } else {
      console.log("Re-run with --fix to insert them.");
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
