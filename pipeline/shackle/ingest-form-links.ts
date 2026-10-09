/**
 * Shackle form links (#18): link inflected surface forms to their Shackle
 * headword, from the `inflections: (...)` notes the main Shackle ingest kept
 * verbatim in definitions.notes.
 *
 * Writes, all with source_code='shackle':
 *   - lexemes          one hub per headword word (reused if another source has one)
 *   - lexeme_citations Shackle's headword for that hub (+ any `infl. as` pointer)
 *   - word_forms       the headword's own membership, then one row per reading
 *                      of every form the corpus attests, with 023's feature
 *                      columns and the verbatim tag in label_raw
 *
 * Planning is pure (form-links.ts). Definitions are never touched, so a form
 * link sits beside any direct entry for the same word.
 *
 * Idempotent: wipes this source's form links (pipeline/shared/wipe-form-links.ts)
 * and reloads. Run after `npm run ingest:shackle`, which clears them too.
 *
 * Usage: npm run ingest:shackle:forms [-- --dry-run]
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { supabaseAdmin } from "../shared/db";
import { getArg, sleep } from "../shared/utils";
import { fetchAllRows } from "../../lib/fetch-all-rows";
import { wipeFormLinks } from "../shared/wipe-form-links";
import { planFormLinks, type ShackleEntry } from "./form-links";

type DB = ReturnType<typeof supabaseAdmin>;

const SOURCE_CODE = "shackle";
const BATCH = 500;

async function loadEntries(db: DB, sourceId: number): Promise<ShackleEntry[]> {
  type Row = { id: number; word_id: number; sense_number: number; notes: string | null; words: { gurmukhi: string } | null };
  const rows = await fetchAllRows<Row>("definitions(shackle inflections)", () =>
    db
      .from("definitions")
      .select("id, word_id, sense_number, notes, words(gurmukhi)")
      .eq("dict_source_id", sourceId)
      .like("notes", "%inflections: %")
      .order("id")
  );
  return rows
    .filter((r) => r.words?.gurmukhi)
    .map((r) => ({
      definitionId: r.id,
      wordId: r.word_id,
      headword: r.words!.gurmukhi,
      senseNumber: r.sense_number,
      notes: r.notes,
    }));
}

async function loadCorpus(db: DB): Promise<Map<string, number>> {
  const rows = await fetchAllRows<{ id: number; gurmukhi: string }>("words(in_corpus)", () =>
    db.from("words").select("id, gurmukhi").eq("in_corpus", true).order("id")
  );
  return new Map(rows.map((r) => [r.gurmukhi.normalize("NFC"), r.id]));
}

/** Word ids of every Shackle entry, with or without an inflections note. */
async function loadHeadwordIds(db: DB, sourceId: number): Promise<Set<number>> {
  const rows = await fetchAllRows<{ word_id: number }>("definitions(shackle headwords)", () =>
    db.from("definitions").select("word_id").eq("dict_source_id", sourceId).order("id")
  );
  return new Set(rows.map((r) => r.word_id));
}

async function insertAll(db: DB, table: string, rows: Record<string, unknown>[], select?: string) {
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < rows.length; i += BATCH) {
    const q = db.from(table).insert(rows.slice(i, i + BATCH));
    const { data, error } = select ? await q.select(select) : await q;
    if (error) throw new Error(`insert ${table}: ${error.message}`);
    out.push(...((data as Record<string, unknown>[] | null) ?? []));
    if (i + BATCH < rows.length) await sleep(20);
  }
  return out;
}

async function main() {
  const dryRun = getArg("dry-run") !== undefined;
  const db = supabaseAdmin();

  const { data: src, error } = await db.from("dict_sources").select("id").eq("code", SOURCE_CODE).single();
  if (error || !src) throw new Error(`dict_source '${SOURCE_CODE}' not found`);

  const [entries, corpus, headwordIds] = await Promise.all([
    loadEntries(db, src.id),
    loadCorpus(db),
    loadHeadwordIds(db, src.id),
  ]);
  console.log(`Loaded ${entries.length} Shackle definitions with inflections notes; ${corpus.size} corpus words.`);

  const plan = planFormLinks(entries, corpus, headwordIds);
  const formWords = new Set(plan.forms.filter((f) => !f.features.headword).map((f) => f.wordId));
  console.log("Plan:", {
    ...plan.stats,
    lexemes: plan.lexemes.length,
    word_forms: plan.forms.length,
    distinctFormWords: formWords.size,
  });

  if (dryRun) {
    for (const f of plan.forms.slice(0, 25)) {
      const label = f.features.headword ? "(headword)" : f.label_raw ?? "";
      console.log(`  ${f.headword}  <-  ${f.wordId}  r${f.reading_number}  ${label}  ${f.features.form_roman ?? ""}`);
    }
    console.log("\nDry run: nothing written.");
    return;
  }

  console.log("Clearing previous Shackle form links...");
  await wipeFormLinks(db, SOURCE_CODE);

  // One hub per word: reuse a hub another source already rooted on the word.
  const roots = plan.lexemes.map((l) => l.rootWordId);
  const existing = new Map<number, number>();
  for (let i = 0; i < roots.length; i += BATCH) {
    const { data, error: e } = await db.from("lexemes").select("id, root_word_id").in("root_word_id", roots.slice(i, i + BATCH));
    if (e) throw new Error(`lexemes lookup: ${e.message}`);
    for (const r of data ?? []) existing.set(r.root_word_id, r.id);
  }
  const toCreate = plan.lexemes.filter((l) => !existing.has(l.rootWordId));
  const created = await insertAll(
    db,
    "lexemes",
    toCreate.map((l) => ({ root_word_id: l.rootWordId, lemma_gurmukhi: l.headword, provenance: "imported" })),
    "id, root_word_id"
  );
  const hubOf = new Map(existing);
  for (const r of created) hubOf.set(r.root_word_id as number, r.id as number);
  console.log(`Lexemes: ${created.length} created, ${existing.size} reused.`);

  await insertAll(
    db,
    "lexeme_citations",
    plan.lexemes.map((l) => ({
      lexeme_id: hubOf.get(l.rootWordId),
      source_code: SOURCE_CODE,
      citation_gurmukhi: l.headword,
      notes: l.citationNotes,
    }))
  );

  await insertAll(
    db,
    "word_forms",
    plan.forms.map((f) => ({
      lexeme_id: hubOf.get(f.rootWordId),
      word_id: f.wordId,
      source_code: SOURCE_CODE,
      reading_number: f.reading_number,
      label_raw: f.label_raw,
      person: f.person,
      number: f.number,
      gender: f.gender,
      gram_case: f.gram_case,
      verb_form: f.verb_form,
      tense_mood: f.tense_mood,
      features: f.features,
      provenance: "imported",
    }))
  );
  console.log(`word_forms: ${plan.forms.length} rows written.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
