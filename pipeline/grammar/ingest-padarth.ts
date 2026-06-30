/**
 * Sourced-grammar ingestion from Sahib Singh's Darpan pad-arth.
 *
 * Reads the pad-arth commentaries already in line_translations
 * (source_code='ss_padarth') and mines Sahib Singh's EXPLICIT grammar statements
 * (gender/number/POS/case) with pipeline/grammar/padarth.ts, then writes them to
 * word_grammar as cited facts: provenance='imported', source_code='ss_padarth',
 * source_line_id pointing at the exact line, and a rule_code into the
 * SS_PADARTH_* registry entries (tier source_extraction, verified). Unlike the
 * rule engine these are read straight from a scholar — the authority is his.
 *
 * One row per (word, attribute) so each datum cites its own rule, matching how
 * the word page renders grammar. Idempotent: replaces only rows whose
 * source_code='ss_padarth', leaving rule-derived rows untouched.
 *
 * Usage (from gurmukhi-kosh project root):
 *   npm run ingest:grammar:padarth
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { supabaseAdmin } from "../shared/db";
import { progress } from "../shared/utils";
import { extractGrammarFacts, type GramAttr } from "./padarth";

const SOURCE_CODE = "ss_padarth";

// attribute → (word_grammar column, registry rule_code)
const ATTR: Record<GramAttr, { column: "gender" | "number" | "pos" | "gram_case"; rule: string }> = {
  gender: { column: "gender", rule: "SS_PADARTH_GENDER" },
  number: { column: "number", rule: "SS_PADARTH_NUMBER" },
  pos: { column: "pos", rule: "SS_PADARTH_POS" },
  gram_case: { column: "gram_case", rule: "SS_PADARTH_CASE" },
};

type LineRow = {
  line_id: number;
  body_unicode: string;
  lines: { ang: number | null } | null;
};

async function main() {
  const db = supabaseAdmin();
  console.log(`Mining grammar facts from '${SOURCE_CODE}' pad-arth...`);

  // 1. Pull every pad-arth line with its ang (for the citation locator).
  const { data: rows, error } = await db
    .from("line_translations")
    .select("line_id, body_unicode, lines(ang)")
    .eq("source_code", SOURCE_CODE);
  if (error) {
    console.error("line_translations fetch error:", error.message);
    process.exit(1);
  }
  const lineRows = (rows ?? []) as unknown as LineRow[];
  console.log(`Pad-arth lines: ${lineRows.length}`);

  // 2. Extract candidate facts per line.
  type Candidate = {
    headword: string;
    attribute: GramAttr;
    value: string;
    line_id: number;
    ang: number | null;
    snippet: string;
  };
  const candidates: Candidate[] = [];
  for (const r of lineRows) {
    for (const f of extractGrammarFacts(r.body_unicode)) {
      candidates.push({ ...f, line_id: r.line_id, ang: r.lines?.ang ?? null });
    }
  }
  console.log(`Candidate facts extracted: ${candidates.length}`);

  // 3. Resolve head-words to word ids; drop facts for forms we don't have.
  const forms = Array.from(new Set(candidates.map((c) => c.headword)));
  const wordIdByForm = new Map<string, number>();
  for (let i = 0; i < forms.length; i += 200) {
    const batch = forms.slice(i, i + 200);
    const { data, error: wErr } = await db.from("words").select("id, gurmukhi").in("gurmukhi", batch);
    if (wErr) {
      console.error("words lookup error:", wErr.message);
      process.exit(1);
    }
    for (const w of data ?? []) wordIdByForm.set(w.gurmukhi, w.id);
  }
  const unmatched = new Set<string>();

  // 4. Build rows, de-duplicated per (word, attribute, value); keep the first
  //    line as the citation. Conflicting values for one word (rare, e.g. a word
  //    used in both genders) are kept as separate cited attestations.
  type GrammarInsert = {
    word_id: number;
    pos: string | null;
    gender: string | null;
    number: string | null;
    gram_case: string | null;
    rule_code: string;
    provenance: string;
    source_code: string;
    source_line_id: number;
    confidence: null;
    review_status: string;
    notes: string;
  };
  const inserts: GrammarInsert[] = [];
  const seen = new Set<string>();
  const byAttr: Record<string, number> = { gender: 0, number: 0, pos: 0, gram_case: 0 };

  for (const c of candidates) {
    const wordId = wordIdByForm.get(c.headword);
    if (wordId == null) {
      unmatched.add(c.headword);
      continue;
    }
    const key = `${wordId}|${c.attribute}|${c.value}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const spec = ATTR[c.attribute];
    inserts.push({
      word_id: wordId,
      pos: spec.column === "pos" ? c.value : null,
      gender: spec.column === "gender" ? c.value : null,
      number: spec.column === "number" ? c.value : null,
      gram_case: spec.column === "gram_case" ? c.value : null,
      rule_code: spec.rule,
      provenance: "imported",
      source_code: SOURCE_CODE,
      source_line_id: c.line_id,
      confidence: null,
      review_status: "unreviewed",
      notes: `Stated by Prof. Sahib Singh in his Darpan pad-arth${c.ang ? ` (ang ${c.ang})` : ""}: «${c.snippet}»`,
    });
    byAttr[c.attribute]++;
  }

  console.log(
    `Rows to write: ${inserts.length} ` +
      `(gender ${byAttr.gender}, number ${byAttr.number}, pos ${byAttr.pos}, case ${byAttr.gram_case}) ` +
      `for ${new Set(inserts.map((r) => r.word_id)).size} words. ` +
      `Unmatched forms: ${unmatched.size}.`
  );

  // 5. Idempotent replace: only this source's rows.
  const { error: delErr } = await db.from("word_grammar").delete().eq("source_code", SOURCE_CODE);
  if (delErr) {
    console.error("word_grammar delete error:", delErr.message);
    process.exit(1);
  }

  let done = 0;
  const t0 = Date.now();
  for (let i = 0; i < inserts.length; i += 100) {
    const batch = inserts.slice(i, i + 100);
    const { error: insErr } = await db.from("word_grammar").insert(batch);
    if (insErr) {
      console.error("\nword_grammar insert error:", insErr.message);
      process.exit(1);
    }
    done += batch.length;
    progress(done, inserts.length, t0, "Grammar ");
  }
  console.log(`\nDone. ${done} sourced grammar rows written from ${SOURCE_CODE}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
