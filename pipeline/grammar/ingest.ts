/**
 * Grammar engine ingestion (P3).
 *
 * Runs the rule-based grammar engine over a word set and populates three tables:
 *   - word_grammar : POS (+ case/number for nominals) per word
 *   - lexemes      : a canonical grouping for a set of inflected forms
 *   - word_forms   : each surface form mapped to its lexeme
 *
 * POS comes from Mahan Kosh sense markers; case/number from the surface form's
 * final vowel (Sahib Singh's Viakaran). All rows are written with
 * provenance='rule_derived' so they can be re-derived idempotently without
 * touching any human-curated rows.
 *
 * Usage (from gurmukhi-kosh project root):
 *   npm run ingest:grammar                 # default word set: japji
 *   npm run ingest:grammar -- --word-set=japji
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { supabaseAdmin } from "../shared/db";
import { fetchWordSet } from "../shared/word-sets";
import { getArg, progress } from "../shared/utils";
import { buildGrammar } from "./build";
import { groupLexemes } from "./lexeme";
import { stem } from "./viakaran";

const MAHAN_KOSH_CODE = "mahan_kosh";
const PROVENANCE = "rule_derived";

async function main() {
  const db = supabaseAdmin();
  const setCode = getArg("word-set") || "japji";

  console.log(`Word set: ${setCode}`);
  const members = await fetchWordSet(db, setCode);
  console.log(`Members: ${members.length}`);

  const wordIdByForm = new Map<string, number>();
  for (const m of members) wordIdByForm.set(m.gurmukhi, m.word_id);
  const wordIds = members.map((m) => m.word_id);

  // 1. Pull Mahan Kosh senses for these words → word_id → definition_text[].
  const { data: dictSource } = await db
    .from("dict_sources")
    .select("id")
    .eq("code", MAHAN_KOSH_CODE)
    .single();
  if (!dictSource) {
    console.error(`dict_source '${MAHAN_KOSH_CODE}' not found.`);
    process.exit(1);
  }

  const sensesByWord = new Map<number, { definition_text: string }[]>();
  for (let i = 0; i < wordIds.length; i += 200) {
    const batch = wordIds.slice(i, i + 200);
    const { data, error } = await db
      .from("definitions")
      .select("word_id, sense_number, definition_text")
      .eq("dict_source_id", dictSource.id)
      .in("word_id", batch)
      .order("sense_number", { ascending: true });
    if (error) {
      console.error("Definition fetch error:", error.message);
      process.exit(1);
    }
    for (const row of data ?? []) {
      const list = sensesByWord.get(row.word_id) ?? [];
      list.push({ definition_text: row.definition_text });
      sensesByWord.set(row.word_id, list);
    }
  }
  console.log(`Words with Mahan Kosh senses: ${sensesByWord.size}`);

  // 2. Build word_grammar rows.
  type GrammarInsert = {
    word_id: number;
    pos: string | null;
    gender: string | null;
    number: string | null;
    gram_case: string | null;
    rule_code: string | null;
    confidence: number | null;
    notes: string | null;
    provenance: string;
  };
  const grammarRows: GrammarInsert[] = [];
  for (const m of members) {
    const senses = sensesByWord.get(m.word_id);
    if (!senses?.length) continue;
    for (const g of buildGrammar(m.gurmukhi, senses)) {
      grammarRows.push({ word_id: m.word_id, ...g, provenance: PROVENANCE });
    }
  }
  console.log(`Grammar rows to write: ${grammarRows.length}`);

  // Idempotent replace: drop only rule-derived rows for this set's words.
  const { error: delGramErr } = await db
    .from("word_grammar")
    .delete()
    .in("word_id", wordIds)
    .eq("provenance", PROVENANCE);
  if (delGramErr) {
    console.error("word_grammar delete error:", delGramErr.message);
    process.exit(1);
  }

  let gramDone = 0;
  const t0 = Date.now();
  for (let i = 0; i < grammarRows.length; i += 100) {
    const batch = grammarRows.slice(i, i + 100);
    const { error } = await db.from("word_grammar").insert(batch);
    if (error) {
      console.error(`\nword_grammar insert error:`, error.message);
      process.exit(1);
    }
    gramDone += batch.length;
    progress(gramDone, grammarRows.length, t0, "Grammar ");
  }
  console.log("");

  // 3. Build lexemes + word_forms by grouping the set's surface forms by stem.
  const groups = groupLexemes(members.map((m) => m.gurmukhi));
  console.log(`Lexeme groups (>=2 related forms): ${groups.length}`);

  // Resolve a root_word_id per group: prefer the member whose form equals the
  // stem (the bare lemma), else the first form in the group.
  const lexemeInserts = groups.map((grp) => {
    const rootForm = grp.forms.find((f) => f.gurmukhi === grp.stem) ?? grp.forms[0];
    return {
      root_word_id: wordIdByForm.get(rootForm.gurmukhi)!,
      notes: `Auto-grouped by shared stem '${stem(rootForm.gurmukhi)}'`,
      provenance: PROVENANCE,
      _forms: grp.forms,
    };
  });

  // Idempotent replace: drop rule-derived lexemes rooted at this set's words
  // (word_forms cascade on lexeme delete).
  const rootIds = lexemeInserts.map((l) => l.root_word_id);
  if (rootIds.length) {
    const { error: delLexErr } = await db
      .from("lexemes")
      .delete()
      .in("root_word_id", rootIds)
      .eq("provenance", PROVENANCE);
    if (delLexErr) {
      console.error("lexemes delete error:", delLexErr.message);
      process.exit(1);
    }
  }

  let lexCount = 0;
  let formCount = 0;
  for (const lex of lexemeInserts) {
    const { _forms, ...lexRow } = lex;
    const { data: inserted, error: lexErr } = await db
      .from("lexemes")
      .insert(lexRow)
      .select("id")
      .single();
    if (lexErr || !inserted) {
      console.error("lexeme insert error:", lexErr?.message);
      process.exit(1);
    }
    lexCount++;

    const formRows = _forms
      .map((f) => ({
        lexeme_id: inserted.id,
        word_id: wordIdByForm.get(f.gurmukhi),
        inflection_desc: f.inflection_desc,
        provenance: PROVENANCE,
      }))
      .filter((r) => r.word_id != null);
    const { error: formErr } = await db.from("word_forms").insert(formRows);
    if (formErr) {
      console.error("word_forms insert error:", formErr.message);
      process.exit(1);
    }
    formCount += formRows.length;
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `\nDone in ${elapsed}s. word_grammar: ${gramDone}, lexemes: ${lexCount}, word_forms: ${formCount}.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
