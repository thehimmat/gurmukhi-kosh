import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function getUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
}
function getAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
}

// Lazy singleton — avoids throwing at module-load time during Next.js build
let _client: SupabaseClient | null = null;
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    if (!_client) _client = createClient(getUrl(), getAnonKey());
    return (_client as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export function supabaseAdmin() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(getUrl(), serviceKey, {
    auth: { persistSession: false },
  });
}

export type Word = {
  id: number;
  gurmukhi: string;
  frequency: number;
  ipa_display?: string | null;       // faithful display IPA (NOT the phonetic_ipa fuzzy key)
  roman_iso15919?: string | null;
  roman_practical?: string | null;
};

// Provenance + review fields present on every enrichment table (migration 003).
export type Provenance =
  | "scraped" | "imported" | "rule_derived" | "computed" | "ai_draft" | "human_verified";
export type ReviewStatus = "unreviewed" | "approved" | "needs_work" | "rejected";
export type Curated = {
  provenance?: Provenance | null;
  review_status?: ReviewStatus | null;
};

export type Shabad = {
  id: number;
  raag_english: string | null;
  raag_gurmukhi: string | null;
  writer_english: string | null;
  writer_id: number | null;
  ang_start: number;
};

export type Line = {
  id: number;
  verse_id: number;
  shabad_id: number;
  ang: number;
  line_no: number;
  gurmukhi: string;
  translation_en: string | null;
  transliteration_en: string | null;
  source_id: string;
};

export type WordOccurrence = {
  id: number;
  word_id: number;
  line_id: number;
  position: number;
};

export type MahanKoshRef = {
  id: number;
  word_id: number;
  entry_gurmukhi: string | null;
  definition: string | null;
  source_url: string | null;
  notes: string | null;
};

export type OccurrenceWithLine = WordOccurrence & {
  lines: Line & { shabads: Shabad | null };
};

// --- New word-feature types (002_word_features) ---

export type DictSource = {
  id: number;
  code: string;
  name: string;
  language: string | null;
  url: string | null;
  notes: string | null;
  ingested_at: string | null;
};

export type Definition = Curated & {
  id: number;
  word_id: number;
  dict_source_id: number;
  entry_gurmukhi: string | null;
  sense_number: number | null;
  definition_text: string;
  definition_en: string | null;
  cross_refs: Record<string, string> | null;
  source_url: string | null;
  notes: string | null;
};

export type DefinitionWithSource = Definition & {
  dict_sources: DictSource | null;
};

export type Etymology = Curated & {
  id: number;
  word_id: number;
  order_index: number;
  origin_language: string;
  root_form: string | null;
  root_form_roman: string | null;
  derivation_note: string | null;
  source_text: string | null;
  // Shackle etymology extras (migration 018): CDIAL/Turner headword number,
  // etymological doublets/compare-forms, and Shackle's own hedging markers.
  cdial?: number | null;
  doublet_of?: string[] | null;
  compare_forms?: string[] | null;
  is_hypothetical?: boolean | null;
  doubtful?: "no" | "doubtful" | "very-doubtful" | null;
  source_code?: string | null;
};

export type DictExample = {
  id: number;
  word_id: number;
  definition_id: number | null;
  dict_source_id: number;
  order_index: number;
  quote_roman: string | null; // internal cross-reference; NOT rendered
  translation: string | null;
  citation_raw: string | null;
  citation_siglum: string | null;
  citation_hymn: string | null;
  citation_verse: string | null;
  citation_author: string | null;
};

export type WordGrammar = Curated & {
  id: number;
  word_id: number;
  definition_id: number | null;
  pos: string | null;
  gender: string | null;
  number: string | null;
  gram_case: string | null;
  notes: string | null;
  rule_code: string | null;
  confidence: number | null;
  person: string | null;
  verb_form: string | null;
  // Per-datum citation (migration 011): a sourced grammar fact points at the
  // exact line it was read from (e.g. Sahib Singh's pad-arth).
  source_code: string | null;
  source_line_id: number | null;
};

// Registry (migration 009) explaining each rule_code: its plain-English basis,
// scholarly citation, tier, and whether it's been verified against the source.
export type GrammarRule = {
  rule_code: string;
  title: string;
  explanation: string;
  citation: string | null;
  tier: "codified_rule" | "source_extraction" | "heuristic";
  verified: boolean;
};

// word_grammar row with its rule registry entry embedded (FK rule_code).
export type WordGrammarWithRule = WordGrammar & {
  grammar_rules: GrammarRule | null;
};

export type Lexeme = {
  id: number;
  root_word_id: number;
  gloss_en: string | null;
  notes: string | null;
};

export type WordForm = {
  id: number;
  lexeme_id: number;
  word_id: number;
  inflection_desc: string | null;
};

// Community flagging (migration 014). Write-only from the public side (insert
// RLS only) — read/actioned only via the key-gated /admin/flags surface.
export type FlagTargetTable = "word_grammar" | "definitions" | "etymology";
export type FlagType = "incorrect" | "unclear" | "has_better_source" | "other";
export type FlagStatus = "open" | "resolved" | "dismissed";

export type Flag = {
  id: number;
  word_id: number;
  target_table: FlagTargetTable | null;
  target_id: number | null;
  flag_type: FlagType;
  message: string;
  suggested_source: string | null;
  reporter_name: string | null;
  reporter_email: string | null;
  status: FlagStatus;
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
};
