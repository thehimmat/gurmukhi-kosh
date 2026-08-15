/**
 * GET /api/word/[gurmukhi]
 *
 * Returns the full word entry as JSON:
 *   { word, pronunciation, grammar, grammar_caveats, definitions, etymology,
 *     morphological_variants, usage, stats }
 *
 * Existing fields (word, grammar, definitions, etymology, morphological_variants)
 * are preserved for backward compatibility with gurmukhi-search consumers.
 *
 * `grammar` rows are NOT uniformly reliable. Some are read from a cited scholar;
 * others are derived by our own rule engine, and some of those rules are known to
 * be contradicted by the source (issue #21). Each row therefore carries its
 * `grammar_rules` join, and `grammar_caveats` names every unverified rule the
 * payload depends on. Consumers presenting this data should surface that
 * distinction rather than rendering all grammar as equally established.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { analyzeNounForm } from "@/pipeline/grammar/viakaran";

type Params = { params: Promise<{ gurmukhi: string }> };

type GrammarRow = {
  provenance: string | null;
  rule_code: string | null;
  grammar_rules: { rule_code: string; title: string; tier: string; verified: boolean; citation: string | null } | null;
};

/**
 * Names every unverified rule this payload's grammar depends on.
 *
 * A JSON consumer strips whatever framing the HTML carries, so the caveat has to
 * travel with the data. `verified = false` means the rule has not been confirmed
 * against the published source — and for MUKTA_OBL_SG and SIHARI_OBL_SG the source
 * actively contradicts the rule as stated (see issue #21). Readings derived from
 * those rules are our working inference, not a scholar's statement.
 */
function buildCaveats(rows: GrammarRow[]) {
  const seen = new Map<string, { rule_code: string; title: string; citation: string | null }>();
  for (const g of rows) {
    const r = g.grammar_rules;
    if (!r || r.verified) continue;
    if (!seen.has(r.rule_code)) {
      seen.set(r.rule_code, { rule_code: r.rule_code, title: r.title, citation: r.citation });
    }
  }
  return [...seen.values()];
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { gurmukhi: encoded } = await params;
  const word = decodeURIComponent(encoded);

  // Fetch word + grammar + pronunciation
  const { data: wordRow, error: wordErr } = await supabase
    .from("words")
    // grammar_rules is joined so every rule-derived reading ships with the rule
    // that produced it — its tier, its citation, and crucially whether it has been
    // verified against the published source. Without it a consumer receives a bare
    // rule_code and no way to know the reading rests on an unverified rule.
    // Kept as one string literal: Supabase parses the select at compile time to
    // infer the row type, and a concatenated expression defeats that.
    .select("id, gurmukhi, frequency, ipa_display, roman_iso15919, roman_practical, word_grammar(*, grammar_rules(rule_code, title, tier, verified, citation))")
    .eq("gurmukhi", word)
    .single();

  if (wordErr || !wordRow) {
    return NextResponse.json({ error: "Word not found" }, { status: 404 });
  }

  const wordId = wordRow.id;
  const w = wordRow as unknown as {
    id: number; gurmukhi: string; frequency: number;
    ipa_display: string | null; roman_iso15919: string | null; roman_practical: string | null;
    word_grammar: GrammarRow[];
  };

  // Parallel: definitions, etymology, lexeme lookup, usage (bigrams/collocations), writer stats
  const [defsResult, etymResult, lexemeFormResult, rulesResult, bgResult, colResult, writerResult] = await Promise.all([
    supabase
      .from("definitions")
      .select("id, sense_number, definition_text, definition_en, cross_refs, source_url, entry_gurmukhi, notes, provenance, review_status, dict_sources(code, name, language, url)")
      .eq("word_id", wordId)
      .order("dict_source_id")
      .order("sense_number"),

    supabase
      .from("etymology")
      .select("id, order_index, origin_language, root_form, root_form_roman, derivation_note, source_text")
      .eq("word_id", wordId)
      .order("order_index"),

    supabase
      .from("word_forms")
      .select("lexeme_id")
      .eq("word_id", wordId)
      .maybeSingle(),

    // Rule registry for the live-derived variant labels below.
    supabase.from("grammar_rules").select("rule_code, title, verified"),

    supabase
      .from("bigrams")
      .select("w1_id, w2_id, pair_count")
      .or(`w1_id.eq.${wordId},w2_id.eq.${wordId}`)
      .order("pair_count", { ascending: false })
      .limit(15),

    supabase
      .from("collocations")
      .select("word_a_id, word_b_id, pair_count, pmi")
      .or(`word_a_id.eq.${wordId},word_b_id.eq.${wordId}`)
      .order("pmi", { ascending: false })
      .limit(15),

    // writer_english requires migration 008; until applied this errors and
    // degrades to an empty list (we only read .data).
    supabase
      .from("word_writer_stats")
      .select("writer_english, occurrence_count")
      .eq("word_id", wordId)
      .order("occurrence_count", { ascending: false })
      .limit(10),
  ]);

  // Morphological variants. The inflection label is derived live from the
  // form's ending (#56) — the cached inflection_desc column is not read — so
  // each label ships with the rule that produced it and that rule's verified
  // status. inflection_desc keeps its key for backward compatibility.
  const rulesByCode = new Map(
    ((rulesResult.data ?? []) as Array<{ rule_code: string; title: string; verified: boolean }>).map((r) => [r.rule_code, r])
  );
  let morphological_variants: Array<{
    gurmukhi: string;
    inflection_desc: string | null;
    rule_code: string | null;
    rule_verified: boolean | null;
  }> = [];
  if (lexemeFormResult.data?.lexeme_id) {
    const lexemeId = lexemeFormResult.data.lexeme_id as number;
    const { data: formRows } = await supabase
      .from("word_forms")
      .select("words(id, gurmukhi)")
      .eq("lexeme_id", lexemeId);

    morphological_variants = (
      (formRows ?? []) as unknown as Array<{ words: { id: number; gurmukhi: string } | null }>
    )
      .filter((f) => f.words?.gurmukhi && f.words.gurmukhi !== word)
      .map((f) => {
        const g = f.words!.gurmukhi;
        const a = analyzeNounForm(g);
        const label = [a.gram_case, a.number].filter(Boolean).join(" ") || null;
        const rule = a.rule_code ? rulesByCode.get(a.rule_code) : undefined;
        return {
          gurmukhi: g,
          inflection_desc: label,
          rule_code: label ? a.rule_code : null,
          rule_verified: label ? rule?.verified ?? false : null,
        };
      });
  }

  // Usage: resolve bigram/collocation partner word_ids to Gurmukhi
  const bgRows = (bgResult.data ?? []) as Array<{ w1_id: number; w2_id: number; pair_count: number }>;
  const colRows = (colResult.data ?? []) as Array<{ word_a_id: number; word_b_id: number; pair_count: number; pmi: number | null }>;
  const partnerIds = new Set<number>();
  for (const r of bgRows) { partnerIds.add(r.w1_id); partnerIds.add(r.w2_id); }
  for (const r of colRows) { partnerIds.add(r.word_a_id); partnerIds.add(r.word_b_id); }
  const { data: partnerWords } = partnerIds.size
    ? await supabase.from("words").select("id, gurmukhi").in("id", [...partnerIds])
    : { data: [] };
  const idToGur = new Map(((partnerWords ?? []) as Array<{ id: number; gurmukhi: string }>).map((pw) => [pw.id, pw.gurmukhi]));

  const phrases = bgRows.map((r) => ({ w1: idToGur.get(r.w1_id) ?? null, w2: idToGur.get(r.w2_id) ?? null, count: r.pair_count }));
  const collocations = colRows.map((r) => {
    const partnerId = r.word_a_id === wordId ? r.word_b_id : r.word_a_id;
    return { word: idToGur.get(partnerId) ?? null, count: r.pair_count, pmi: r.pmi };
  });
  const writers = ((writerResult.data ?? []) as Array<{ writer_english: string | null; occurrence_count: number }>)
    .map((r) => ({ writer: r.writer_english, count: r.occurrence_count }));

  return NextResponse.json({
    word: {
      id: w.id,
      gurmukhi: w.gurmukhi,
      frequency: w.frequency,
    },
    pronunciation: {
      ipa_display: w.ipa_display,
      roman_iso15919: w.roman_iso15919,
      roman_practical: w.roman_practical,
    },
    grammar: w.word_grammar ?? [],
    // Additive, so existing consumers are unaffected. Empty array = every rule
    // behind this word's grammar has been verified against its source.
    grammar_caveats: buildCaveats(w.word_grammar ?? []),
    definitions: defsResult.data ?? [],
    etymology: etymResult.data ?? [],
    morphological_variants,
    usage: { phrases, collocations },
    stats: { writers },
  });
}
