/**
 * Registry of named word sets. A word set scopes enrichment work (scraping,
 * grammar, AI drafts) to a slice of the corpus. Add a bani here to make it
 * buildable with `npm run wordset:build -- --set=<code>`.
 */

export type WordSetDefinition =
  | { type: "banidb_bani"; baniId: number }
  | { type: "ang_range"; start: number; end: number }
  | { type: "shabad_ids"; ids: number[] };

export interface WordSetSpec {
  code: string;
  name: string;
  description?: string;
  definition: WordSetDefinition;
}

export const WORD_SETS: Record<string, WordSetSpec> = {
  japji: {
    code: "japji",
    name: "Japji Sahib",
    description: "Japji Sahib (SGGS angs 1-8), BaniDB bani 2 — V1 deep-dictionary pilot set.",
    definition: { type: "banidb_bani", baniId: 2 },
  },
};
