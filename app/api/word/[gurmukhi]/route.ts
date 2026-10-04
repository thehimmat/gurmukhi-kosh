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
 * `grammar` rows are each read from a named source (`source_code`): a cited
 * scholar (Sahib Singh's pad-arth, Shackle) or a Mahan Kosh part-of-speech
 * marker. Nothing is inferred from a word's spelling (#30); the Viakaran ending
 * rules that used to fill case/number/gender were retired by migration 037.
 * Each row still carries its `grammar_rules` join (pad-arth extraction rules),
 * and `grammar_caveats` names any unverified rule the payload depends on.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchMorphVariants, fetchUsage, fetchWriterStats } from "@/lib/word-data";

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
 * against the published source.
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
    // grammar_rules is joined so a reading extracted by rule (pad-arth) ships
    // with that rule's tier, citation, and whether it has been verified.
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

  // Parallel: definitions, etymology, usage, writer stats.
  // The morphological-variant and usage derivations are shared with the word
  // page via lib/word-data.ts so the two surfaces cannot drift.
  const [defsResult, etymResult, usage, writerRows] = await Promise.all([
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

    fetchUsage(wordId),
    fetchWriterStats(wordId, 10),
  ]);

  // inflection_desc keeps its key for backward compatibility and now carries
  // the source's own label. rule_code / rule_verified are kept for existing
  // consumers but are always null: no variant label is rule-derived any more.
  const morphological_variants = (await fetchMorphVariants(wordId, word)).map((v) => ({
    gurmukhi: v.gurmukhi,
    inflection_desc: v.label,
    source_code: v.sourceCode,
    rule_code: null,
    rule_verified: null,
  }));

  const phrases = usage.phrases;
  const collocations = usage.collocates.map((c) => ({ word: c.partner, count: c.count, pmi: c.pmi }));
  const writers = writerRows.map((r) => ({ writer: r.writer_english, count: r.occurrence_count }));

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
