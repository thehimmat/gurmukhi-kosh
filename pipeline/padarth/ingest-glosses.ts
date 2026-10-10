/**
 * Write Sahib Singh's pad-arth gloss list as rows (#165): padarth_glosses,
 * padarth_gloss_occurrences and padarth_case_evidence (migration 041).
 *
 * Reads every ss_padarth row from line_translations, plans it with
 * plan-glosses.ts, then replaces this source's rows. Base-form links use the
 * sourced word_forms (Shackle, #18), so re-run this after
 * `npm run ingest:shackle:forms`: rebuilding those hubs removes the links
 * that pointed at them.
 *
 * Usage (from gurmukhi-kosh project root):
 *   npm run ingest:padarth:glosses -- --dry-run   # plan and report, write nothing
 *   npm run ingest:padarth:glosses
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { supabaseAdmin } from "../shared/db";
import { getArg, progress, sleep } from "../shared/utils";
import { fetchAllRows } from "../../lib/fetch-all-rows";
import { planGlosses, type PlanToken } from "./plan-glosses";

type DB = ReturnType<typeof supabaseAdmin>;

const SOURCE_CODE = "ss_padarth";
const BATCH = 500;
const LINE_CHUNK = 500;

async function loadPadarth(db: DB) {
  return fetchAllRows<{ line_id: number; body_unicode: string }>("line_translations(ss_padarth)", () =>
    db.from("line_translations").select("line_id, body_unicode").eq("source_code", SOURCE_CODE).order("line_id")
  );
}

async function loadTokens(db: DB, lineIds: number[], gurmukhiById: Map<number, string>) {
  const byLine = new Map<number, PlanToken[]>();
  type Row = { id: number; line_id: number; position: number; word_id: number };
  for (let i = 0; i < lineIds.length; i += LINE_CHUNK) {
    const chunk = lineIds.slice(i, i + LINE_CHUNK);
    const rows = await fetchAllRows<Row>("word_occurrences(pad-arth lines)", () =>
      db.from("word_occurrences").select("id, line_id, position, word_id").in("line_id", chunk).order("id")
    );
    for (const r of rows) {
      const tokens = byLine.get(r.line_id) ?? [];
      tokens.push({ occurrenceId: r.id, position: r.position, wordId: r.word_id, gurmukhi: gurmukhiById.get(r.word_id) ?? "" });
      byLine.set(r.line_id, tokens);
    }
  }
  return byLine;
}

/** In-corpus words, plus any word a sourced form link names (off-corpus Shackle roots). */
async function loadWords(db: DB, extraIds: number[]) {
  const rows = await fetchAllRows<{ id: number; gurmukhi: string }>("words(in_corpus)", () =>
    db.from("words").select("id, gurmukhi").eq("in_corpus", true).order("id")
  );
  const byId = new Map(rows.map((r) => [r.id, r.gurmukhi]));
  const missing = extraIds.filter((id) => !byId.has(id));
  for (let i = 0; i < missing.length; i += LINE_CHUNK) {
    const { data, error } = await db.from("words").select("id, gurmukhi").in("id", missing.slice(i, i + LINE_CHUNK));
    if (error) throw new Error(`words lookup: ${error.message}`);
    for (const r of data ?? []) byId.set(r.id, r.gurmukhi);
  }
  return byId;
}

async function loadLexemes(db: DB) {
  const rows = await fetchAllRows<{ word_id: number; lexeme_id: number }>("word_forms(sourced)", () =>
    db.from("word_forms").select("word_id, lexeme_id").not("source_code", "is", null).order("id")
  );
  const byWord = new Map<number, number[]>();
  for (const r of rows) {
    const list = byWord.get(r.word_id) ?? [];
    if (!list.includes(r.lexeme_id)) list.push(r.lexeme_id);
    byWord.set(r.word_id, list);
  }
  return byWord;
}

async function insertAll(db: DB, table: string, rows: Record<string, unknown>[], label: string, select?: string) {
  const out: Record<string, unknown>[] = [];
  const t0 = Date.now();
  for (let i = 0; i < rows.length; i += BATCH) {
    const q = db.from(table).insert(rows.slice(i, i + BATCH));
    const { data, error } = select ? await q.select(select) : await q;
    if (error) throw new Error(`insert ${table}: ${error.message}`);
    out.push(...((data as Record<string, unknown>[] | null) ?? []));
    progress(Math.min(i + BATCH, rows.length), rows.length, t0, label);
    if (i + BATCH < rows.length) await sleep(20);
  }
  console.log();
  return out;
}

async function main() {
  const dryRun = getArg("dry-run") !== undefined;
  const db = supabaseAdmin();

  const padarth = await loadPadarth(db);
  const lexemesByWord = await loadLexemes(db);
  const gurmukhiById = await loadWords(db, [...lexemesByWord.keys()]);
  const lineIds = [...new Set(padarth.map((r) => r.line_id))];
  const tokensByLine = await loadTokens(db, lineIds, gurmukhiById);
  console.log(
    `Loaded ${padarth.length} pad-arth rows, ${tokensByLine.size} lines with words, ` +
      `${lexemesByWord.size} words in sourced paradigms.`
  );

  const wordIdByGurmukhi = new Map<string, number>();
  for (const [id, g] of gurmukhiById) if (!wordIdByGurmukhi.has(g)) wordIdByGurmukhi.set(g, id);

  const plan = planGlosses({
    lines: [...tokensByLine].map(([lineId, tokens]) => ({ lineId, tokens })),
    padarth: padarth.map((r) => ({ lineId: r.line_id, body: r.body_unicode })),
    lexemesByWord,
    wordIdByGurmukhi,
  });
  const s = plan.stats;
  console.log("Plan:", s);
  console.log(
    `Entries linked: ${((s.linked / Math.max(s.entries, 1)) * 100).toFixed(1)}% ` +
      `(${s.viaBase} through a Shackle paradigm); unlinked: ${s.unlinked}.`
  );

  if (dryRun) {
    const entries = plan.glosses.filter((g) => g.kind === "entry");
    const sample = (label: string, rows: typeof entries) => {
      console.log(`\n${label}:`);
      for (const g of rows.slice(0, 15)) console.log(`  line ${g.lineId}  ${g.term} = ${g.gloss.slice(0, 50)}`);
    };
    sample("Linked through a Shackle paradigm", entries.filter((g) => g.links.some((l) => l.match === "via_base")));
    sample("Unlinked (every 500th)", entries.filter((g) => g.links.length === 0).filter((_, i) => i % 500 === 0));
    console.log("\nDry run: nothing written.");
    return;
  }

  console.log("Clearing previous pad-arth glosses...");
  for (let i = 0; i < lineIds.length; i += LINE_CHUNK) {
    const { error } = await db
      .from("padarth_glosses")
      .delete()
      .eq("source_code", SOURCE_CODE)
      .in("line_id", lineIds.slice(i, i + LINE_CHUNK));
    if (error) throw new Error(`clear padarth_glosses: ${error.message}`);
  }

  const inserted = await insertAll(
    db,
    "padarth_glosses",
    plan.glosses.map((g) => ({
      line_id: g.lineId,
      source_code: SOURCE_CODE,
      ordinal: g.ordinal,
      kind: g.kind,
      term: g.term,
      gloss: g.gloss,
      notes: g.notes,
      is_phrase: g.isPhrase,
    })),
    "Glosses ",
    "id, line_id, ordinal"
  );
  const idByKey = new Map(inserted.map((r) => [`${r.line_id}|${r.ordinal}`, r.id as number]));
  const idOf = (g: { lineId: number; ordinal: number }) => {
    const id = idByKey.get(`${g.lineId}|${g.ordinal}`);
    if (id === undefined) throw new Error(`no id for gloss ${g.lineId}|${g.ordinal}`);
    return id;
  };

  await insertAll(
    db,
    "padarth_gloss_occurrences",
    plan.glosses.flatMap((g) =>
      g.links.map((l) => ({ gloss_id: idOf(g), word_occurrence_id: l.occurrenceId, match: l.match, lexeme_id: l.lexemeId }))
    ),
    "Links   "
  );
  await insertAll(
    db,
    "padarth_case_evidence",
    plan.glosses.flatMap((g) =>
      g.caseEvidence.map((c) => ({ gloss_id: idOf(g), gram_case: c.gramCase, marker: c.marker, basis: c.basis }))
    ),
    "Cases   "
  );
  console.log(`Done. ${plan.glosses.length} glosses, ${s.links} links, ${s.caseEvidence} case-evidence rows.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
