/**
 * Shackle "A Guru Nanak Glossary" ingestion — Phase 2 (main pass).
 *
 * Reads pipeline/shackle/data/glossary-entries.jsonl and loads the 5,959
 * Gurmukhi-bearing entries (book pp. 1-276) into the dictionary tables under
 * dict_source 'shackle':
 *   - definitions   ← gloss (English)
 *   - word_grammar  ← posRaw / partOfSpeech (+ gender keyword)
 *   - etymology     ← language / sourceForm / cdial / doublets / markers
 *   - dict_examples ← examples[] with parsed AG citations
 *
 * Words:
 *   - entry whose printed Gurmukhi exact-matches an existing `words` row →
 *     attach to that corpus word (spelling corroborated by SGGS; word row left
 *     untouched).
 *   - entry with no corpus match → create an OFF-CORPUS lemma row
 *     (in_corpus=false, origin_source='shackle', spelling_status='unverified_ocr',
 *     roman_shackle=<Shackle transcription, internal>).
 *
 * The 1,226-entry Later-Gurus appendix (no Gurmukhi in the source) is NOT loaded
 * here — it needs the roman→Gurmukhi transliterator (issue #7 follow-up).
 *
 * Idempotent + takedown-proof: every write is scoped to this source
 * (dict_source_id / source_code / origin_source), so a re-run wipes and reloads,
 * and removal on request is the five scoped deletes in wipeSource().
 *
 * Usage: npm run ingest:shackle   (run `npm run ingest:shackle:lookups` first)
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import * as fs from "fs";
import * as readline from "readline";
import { supabaseAdmin } from "../shared/db";
import { sleep, progress } from "../shared/utils";
import type { GlossaryEntry } from "./types";

type DB = ReturnType<typeof supabaseAdmin>;

const JSONL_PATH = "pipeline/shackle/data/glossary-entries.jsonl";
// Appendix entries with Gurmukhi reverse-transliterated by reverse_appendix.py.
const APPENDIX_PATH = "pipeline/shackle/data/appendix-derived.jsonl";
const SOURCE_CODE = "shackle";
const BATCH = 200;

async function resolveSourceId(db: DB): Promise<number> {
  const { data, error } = await db.from("dict_sources").select("id").eq("code", SOURCE_CODE).single();
  if (error || !data) {
    console.error(`dict_source '${SOURCE_CODE}' not found. Apply migration 018 first.`);
    process.exit(1);
  }
  return data.id;
}

async function readEntries(path: string): Promise<GlossaryEntry[]> {
  if (!fs.existsSync(path)) {
    console.error(`Not found: ${path}. Copy the handoff bundle into pipeline/shackle/data/.`);
    process.exit(1);
  }
  const out: GlossaryEntry[] = [];
  const rl = readline.createInterface({ input: fs.createReadStream(path, "utf-8"), crlfDelay: Infinity });
  for await (const line of rl) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      console.warn(`Skipping malformed line: ${t.slice(0, 80)}`);
    }
  }
  return out;
}

type Row = Record<string, unknown>;

/** Five scoped deletes = full idempotent reset AND the takedown procedure. */
async function wipeSource(db: DB, sourceId: number) {
  const steps: [string, PromiseLike<{ error: { message: string } | null }>][] = [
    ["dict_examples", db.from("dict_examples").delete().eq("dict_source_id", sourceId)],
    ["word_grammar", db.from("word_grammar").delete().eq("source_code", SOURCE_CODE)],
    ["etymology", db.from("etymology").delete().eq("source_code", SOURCE_CODE)],
    ["definitions", db.from("definitions").delete().eq("dict_source_id", sourceId)],
    // off-corpus lemma rows this source introduced (cascades to any stragglers)
    ["words(off-corpus)", db.from("words").delete().eq("origin_source", SOURCE_CODE)],
  ];
  for (const [name, run] of steps) {
    const { error } = await run;
    if (error) throw new Error(`wipe ${name}: ${error.message}`);
  }
}

async function insertReturningIds(db: DB, table: string, rows: Row[], selectCols: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let i = 0; i < rows.length; i += BATCH) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await db.from(table).insert(rows.slice(i, i + BATCH) as any).select(selectCols);
    if (error) throw new Error(`insert ${table}: ${error.message}`);
    out.push(...((data as unknown as Row[]) ?? []));
    if (i + BATCH < rows.length) await sleep(20);
  }
  return out;
}

function genderFromPos(partOfSpeech: string[]): string | null {
  const t = partOfSpeech.join(" ").toLowerCase();
  if (t.includes("masculine")) return "masculine";
  if (t.includes("feminine")) return "feminine";
  return null;
}

/** Build the definition's notes: preserve inflections / usage / Shackle frequency losslessly. */
function defNotes(e: GlossaryEntry): string | null {
  const parts: string[] = [];
  if (e.inflectionsRaw) parts.push(`inflections: ${e.inflectionsRaw}`);
  if (e.usageNotes) parts.push(`usage: ${e.usageNotes}`);
  if (e.frequency?.raw) parts.push(`shackle-freq: ${e.frequency.raw}`);
  if (e.glossIsCrossRefOnly) parts.push("cross-reference-only");
  if (e.secondMemberOnly) parts.push("second-member-only");
  if (e._derived) {
    const alts = (e._ambiguities ?? [])
      .filter((a) => a.alternatives?.some((x) => x))
      .map((a) => `${a.kind}[${a.chosen}|${a.alternatives.filter(Boolean).join("/")}]`);
    parts.push(`gurmukhi-derived (reverse-translit${alts.length ? `; ambiguities: ${alts.join(", ")}` : ""})`);
  }
  return parts.length ? parts.join(" | ") : null;
}

function defText(e: GlossaryEntry): string {
  const g = (e.gloss ?? "").trim();
  if (g) return g;
  if (e.etymology?.doubletOf?.length) return `see ${e.etymology.doubletOf.join(", ")}`;
  return "(cross-reference)";
}

async function main() {
  const db = supabaseAdmin();
  const sourceId = await resolveSourceId(db);
  console.log(`dict_source '${SOURCE_CODE}' = ${sourceId}`);

  const all = await readEntries(JSONL_PATH);
  const mainEntries = all.filter((e) => e.gurmukhi && e.gurmukhi.trim());
  // Appendix entries (no Gurmukhi in source) with a reverse-transliterated form.
  // Optional: if the file isn't there, ingest the main pass only.
  const appendixEntries = fs.existsSync(APPENDIX_PATH)
    ? (await readEntries(APPENDIX_PATH)).filter((e) => e.gurmukhi && e.gurmukhi.trim())
    : [];
  const missingAppendix = all.length - mainEntries.length - appendixEntries.length;
  const entries = [...mainEntries, ...appendixEntries];
  console.log(
    `Entries: ${all.length} total | ${mainEntries.length} main + ${appendixEntries.length} appendix(derived)` +
      (missingAppendix ? ` | ${missingAppendix} appendix not yet reverse-transliterated (run reverse_appendix.py)` : ""),
  );

  // 1. Reset this source FIRST — so resolving corpus words below can't match
  //    (and then strand) off-corpus lemmas a prior run created.
  console.log("Wiping prior 'shackle' rows...");
  await wipeSource(db, sourceId);

  // 2. Resolve which printed Gurmukhi already exist as words (corpus, or an
  //    off-corpus lemma introduced by another source — attach either way).
  const gurmukhiSet = [...new Set(entries.map((e) => e.gurmukhi))];
  const wordMap = new Map<string, number>();
  for (let i = 0; i < gurmukhiSet.length; i += 100) {
    const batch = gurmukhiSet.slice(i, i + 100);
    const { data, error } = await db.from("words").select("id, gurmukhi").in("gurmukhi", batch);
    if (error) throw new Error(`word fetch: ${error.message}`);
    for (const r of data ?? []) wordMap.set(r.gurmukhi as string, r.id as number);
  }
  const matched = wordMap.size;
  console.log(`Corpus-matched Gurmukhi: ${matched}/${gurmukhiSet.length} (${((100 * matched) / gurmukhiSet.length).toFixed(1)}%)`);

  // 3. Create off-corpus lemma rows for the unmatched Gurmukhi.
  const unmatched = gurmukhiSet.filter((g) => !wordMap.has(g));
  // pick one representative entry per unmatched Gurmukhi (for roman_shackle)
  const repByGurmukhi = new Map<string, GlossaryEntry>();
  for (const e of entries) if (!wordMap.has(e.gurmukhi) && !repByGurmukhi.has(e.gurmukhi)) repByGurmukhi.set(e.gurmukhi, e);
  // A Gurmukhi backed by any printed (OCR) entry is 'unverified_ocr'; only ones
  // seen exclusively via a derived (appendix) entry are 'derived_transliteration'.
  const hasPrinted = new Set<string>();
  for (const e of entries) if (!e._derived) hasPrinted.add(e.gurmukhi);
  const newWordRows = unmatched.map((g) => ({
    gurmukhi: g,
    frequency: 0,
    in_corpus: false,
    origin_source: SOURCE_CODE,
    spelling_status: hasPrinted.has(g) ? "unverified_ocr" : "derived_transliteration",
    roman_shackle: repByGurmukhi.get(g)?.headword ?? null,
  }));
  console.log(`Creating ${newWordRows.length} off-corpus lemma rows...`);
  const created = await insertReturningIds(db, "words", newWordRows, "id, gurmukhi");
  for (const r of created) wordMap.set(r.gurmukhi as string, r.id as number);
  console.log(`Words resolved: ${wordMap.size} (${matched} corpus + ${created.length} off-corpus)`);

  // 4. Group entries by word_id; assign stable sense_number (homonymIndex or order).
  const byWord = new Map<number, GlossaryEntry[]>();
  for (const e of entries) {
    const wid = wordMap.get(e.gurmukhi);
    if (!wid) continue;
    (byWord.get(wid) ?? byWord.set(wid, []).get(wid)!).push(e);
  }

  // 5. Existing non-shackle etymology order_index per word (so we append, not collide).
  const wordIds = [...byWord.keys()];
  const etymBase = new Map<number, number>();
  for (let i = 0; i < wordIds.length; i += 200) {
    const batch = wordIds.slice(i, i + 200);
    const { data, error } = await db.from("etymology").select("word_id, order_index").in("word_id", batch);
    if (error) throw new Error(`etymology base fetch: ${error.message}`);
    for (const r of data ?? []) {
      const w = r.word_id as number;
      etymBase.set(w, Math.max(etymBase.get(w) ?? 0, r.order_index as number));
    }
  }

  // 6. Build definition rows (need their ids back to link grammar/examples).
  type Keyed = { key: string; entry: GlossaryEntry; wordId: number; sense: number };
  const keyed: Keyed[] = [];
  const defRows: Record<string, unknown>[] = [];
  for (const [wid, es] of byWord) {
    es.sort((a, b) => (a.homonymIndex ?? 0) - (b.homonymIndex ?? 0) || a.id.localeCompare(b.id));
    let sense = 0;
    for (const e of es) {
      sense++;
      keyed.push({ key: `${wid}:${sense}`, entry: e, wordId: wid, sense });
      defRows.push({
        word_id: wid,
        dict_source_id: sourceId,
        entry_gurmukhi: e.gurmukhi,
        sense_number: sense,
        definition_text: defText(e),
        definition_en: (e.gloss ?? "").trim() || null,
        notes: defNotes(e),
        provenance: "imported",
      });
    }
  }
  console.log(`Definitions: ${defRows.length} rows across ${byWord.size} words. Inserting...`);
  const t0 = Date.now();
  const insertedDefs = await insertReturningIds(db, "definitions", defRows, "id, word_id, sense_number");
  const defIdByKey = new Map<string, number>();
  for (const r of insertedDefs) defIdByKey.set(`${r.word_id}:${r.sense_number}`, r.id as number);
  progress(defRows.length, defRows.length, t0, "Defs ");
  console.log();

  // 7. Grammar, etymology, examples — reference the definition id per sense.
  const grammarRows: Record<string, unknown>[] = [];
  const etymRows: Record<string, unknown>[] = [];
  const exampleRows: Record<string, unknown>[] = [];
  const etymNext = new Map<number, number>(); // running order_index per word

  for (const { entry: e, wordId, sense } of keyed) {
    const defId = defIdByKey.get(`${wordId}:${sense}`) ?? null;

    if (e.posRaw || e.partOfSpeech?.length) {
      grammarRows.push({
        word_id: wordId,
        definition_id: defId,
        pos: e.partOfSpeech?.length ? e.partOfSpeech.join("; ") : null,
        gender: genderFromPos(e.partOfSpeech ?? []),
        notes: e.posRaw ? `posRaw: ${e.posRaw}` : null,
        provenance: "imported",
        source_code: SOURCE_CODE,
      });
    }

    if (e.etymology) {
      const et = e.etymology;
      const base = etymBase.get(wordId) ?? 0;
      const n = (etymNext.get(wordId) ?? 0) + 1;
      etymNext.set(wordId, n);
      etymRows.push({
        word_id: wordId,
        order_index: base + n,
        // A bare CDIAL reference (Turner, A Comparative Dictionary of the
        // Indo-Aryan Languages) implies an Indo-Aryan etymon even when Shackle
        // names no language; only truly language-less (doublet/cf.-only) rows
        // stay 'unknown'.
        origin_language: et.language ?? (et.cdial ? "Indo-Aryan" : "unknown"),
        root_form_roman: et.sourceForm ?? null,
        source_text: et.raw ?? e.etymologyRaw ?? null,
        derivation_note: et.derivationChain ?? null,
        cdial: et.cdial ?? null,
        is_hypothetical: et.isHypothetical ?? false,
        doubtful: et.doubtful ?? "no",
        doublet_of: et.doubletOf ?? null,
        compare_forms: et.compare ?? null,
        provenance: "imported",
        source_code: SOURCE_CODE,
      });
    }

    (e.examples ?? []).forEach((ex, idx) => {
      exampleRows.push({
        word_id: wordId,
        definition_id: defId,
        dict_source_id: sourceId,
        order_index: idx + 1,
        quote_roman: ex.text ?? null,
        translation: ex.translation ?? null,
        citation_raw: ex.citationRaw ?? null,
        citation_siglum: ex.citation?.siglum ?? null,
        citation_hymn: ex.citation?.hymn ?? null,
        citation_verse: ex.citation?.verse ?? null,
        citation_author: ex.citation?.author ?? null,
        provenance: "imported",
      });
    });
  }

  console.log(`Grammar: ${grammarRows.length} | Etymology: ${etymRows.length} | Examples: ${exampleRows.length}. Inserting...`);
  for (const [table, rows] of [
    ["word_grammar", grammarRows],
    ["etymology", etymRows],
    ["dict_examples", exampleRows],
  ] as const) {
    const s = Date.now();
    for (let i = 0; i < rows.length; i += BATCH) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await db.from(table).insert(rows.slice(i, i + BATCH) as any);
      if (error) throw new Error(`insert ${table}: ${error.message}`);
      progress(Math.min(i + BATCH, rows.length), rows.length, s, table.padEnd(13));
      if (i + BATCH < rows.length) await sleep(20);
    }
    console.log();
  }

  await db.from("dict_sources").update({ ingested_at: new Date().toISOString() }).eq("id", sourceId);

  console.log("\nDone.");
  console.log(`  words:        ${matched} corpus-matched + ${created.length} off-corpus`);
  console.log(`  definitions:  ${defRows.length}`);
  console.log(`  grammar:      ${grammarRows.length}`);
  console.log(`  etymology:    ${etymRows.length}`);
  console.log(`  examples:     ${exampleRows.length}`);
  console.log(`  appendix:     ${appendixEntries.length} entries via reverse-transliteration (spelling_status='derived_transliteration')`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
