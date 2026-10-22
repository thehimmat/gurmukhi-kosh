// The tables a per-source teardown (pipeline/teardown.ts) clears. Kept apart from the script so
// tests can check a new sourced table is covered.

// Tables keyed by the numeric dict_sources.id. dict_entries' links (dict_entry_links) cascade.
export const BY_DICT_SOURCE_ID = ["definitions", "dict_examples", "dict_entries"] as const;

// Tables keyed by the text source code.
export const BY_SOURCE_CODE = [
  "word_grammar",
  "etymology",
  "word_forms",
  "lexeme_citations",
  "lexeme_relations",
  "citation_sigla",
  "dict_mappings",
  "pos_mappings",
] as const;
