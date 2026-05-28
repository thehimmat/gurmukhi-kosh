/**
 * GET /api/word/[gurmukhi]
 *
 * Returns the full word entry as JSON:
 *   { word, grammar, definitions, etymology, morphological_variants }
 *
 * Useful for search indexers, mobile consumers, or the gurmukhi-search app.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type Params = { params: Promise<{ gurmukhi: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { gurmukhi: encoded } = await params;
  const word = decodeURIComponent(encoded);

  // Fetch word + grammar
  const { data: wordRow, error: wordErr } = await supabase
    .from("words")
    .select("id, gurmukhi, frequency, word_grammar(*)")
    .eq("gurmukhi", word)
    .single();

  if (wordErr || !wordRow) {
    return NextResponse.json({ error: "Word not found" }, { status: 404 });
  }

  const wordId = wordRow.id;

  // Parallel: definitions, etymology, lexeme lookup
  const [defsResult, etymResult, lexemeFormResult] = await Promise.all([
    supabase
      .from("definitions")
      .select("id, sense_number, definition_text, definition_en, cross_refs, source_url, entry_gurmukhi, notes, dict_sources(code, name, language, url)")
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
      .select("lexeme_id, inflection_desc")
      .eq("word_id", wordId)
      .maybeSingle(),
  ]);

  // Morphological variants
  let morphological_variants: Array<{ gurmukhi: string; inflection_desc: string | null }> = [];
  if (lexemeFormResult.data?.lexeme_id) {
    const lexemeId = lexemeFormResult.data.lexeme_id as number;
    const { data: formRows } = await supabase
      .from("word_forms")
      .select("inflection_desc, words(id, gurmukhi)")
      .eq("lexeme_id", lexemeId);

    morphological_variants = (
      (formRows ?? []) as unknown as Array<{ inflection_desc: string | null; words: { id: number; gurmukhi: string } | null }>
    )
      .filter((f) => f.words?.gurmukhi && f.words.gurmukhi !== word)
      .map((f) => ({ gurmukhi: f.words!.gurmukhi, inflection_desc: f.inflection_desc }));
  }

  return NextResponse.json({
    word: {
      id: wordRow.id,
      gurmukhi: wordRow.gurmukhi,
      frequency: wordRow.frequency,
    },
    grammar: (wordRow as unknown as { word_grammar: unknown[] }).word_grammar ?? [],
    definitions: defsResult.data ?? [],
    etymology: etymResult.data ?? [],
    morphological_variants,
  });
}
