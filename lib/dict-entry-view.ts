/**
 * The curator's Dictionaries tab: dictionary entries linked to a word (dict_entry_links, 089 and
 * 092), grouped by dictionary. Links are proposed automatically and mostly unreviewed, so each
 * entry carries how it matched; closer matches sort first.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ALL_SANSKRIT, cologneGloss } from "./cologne-gloss";

export const MAX_PER_SOURCE = 12;

export type DictLinkRow = {
  match_method: string;
  confidence: number | null;
  dict_entries: {
    entry_ref: string;
    headword_native: string;
    script: string;
    headword_gurmukhi: string | null;
    page: string | null;
    body_raw: string;
    parsed: Record<string, unknown> | null;
    source_url: string | null;
    dict_sources: { code: string; name: string; language: string | null } | null;
  } | null;
};

export type DictEntryView = {
  ref: string;
  headword: string;
  script: string;
  iast: string | null;
  gloss: string;
  page: string | null;
  url: string | null;
  method: string;
  methodLabel: string;
  confidence: number;
};

export type DictEntryGroup = {
  code: string;
  name: string;
  language: string | null;
  best: number;
  entries: DictEntryView[];
  hidden: number;
};

const METHOD_LABEL: Record<string, string> = {
  manual: "linked by hand",
  exact: "exact",
  fold: "spelling variant",
  loose: "loose match",
  stem: "stem match",
};

export const METHOD_HELP: Record<string, string> = {
  exact: "The dictionary's headword is this exact spelling.",
  fold: "Same word once vowel length, retroflex/dental and a final short vowel are set aside.",
  loose: "Also ignores halant, ਵ/ਬ, ਯ/ਜ, kṣ/ਖ, jñā/ਗਿਆ and a final vowel: likely, not certain.",
  stem: "A Sanskrit -n/-s stem matched without its final consonant (nāman ~ ਨਾਮੁ): a guess.",
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

export function dictEntryGroups(rows: DictLinkRow[]): DictEntryGroup[] {
  const groups = new Map<string, DictEntryGroup & { all: DictEntryView[] }>();
  for (const r of rows) {
    const e = r.dict_entries;
    const src = e?.dict_sources;
    if (!e || !src) continue;
    const confidence = r.confidence ?? 0;
    const view: DictEntryView = {
      ref: e.entry_ref,
      headword: e.headword_native,
      script: e.script,
      iast: e.script === "devanagari" ? str(e.parsed?.iast) : null,
      gloss: src.code.startsWith("cologne_")
        ? cologneGloss(e.body_raw, ALL_SANSKRIT.has(src.code) ? "devanagari" : "iast")
        : (str(e.parsed?.plain) ?? e.body_raw),
      page: e.page,
      url: e.source_url,
      method: r.match_method,
      methodLabel: METHOD_LABEL[r.match_method] ?? r.match_method,
      confidence,
    };
    const g = groups.get(src.code) ?? { code: src.code, name: src.name, language: src.language, best: 0, entries: [], hidden: 0, all: [] };
    g.all.push(view);
    g.best = Math.max(g.best, confidence);
    groups.set(src.code, g);
  }
  return [...groups.values()]
    .sort((a, b) => b.best - a.best || a.name.localeCompare(b.name))
    .map(({ all, ...g }) => {
      const sorted = [...all].sort((a, b) => b.confidence - a.confidence);
      return { ...g, entries: sorted.slice(0, MAX_PER_SOURCE), hidden: Math.max(0, sorted.length - MAX_PER_SOURCE) };
    });
}

/** Every entry linked to a word, through the curator client (unreviewed links are curator-only). */
export async function fetchDictEntryLinks(db: SupabaseClient, wordId: number): Promise<DictLinkRow[]> {
  const { data, error } = await db
    .from("dict_entry_links")
    .select(
      "match_method, confidence, dict_entries(entry_ref, headword_native, script, headword_gurmukhi, page, body_raw, parsed, source_url, dict_sources(code, name, language))",
    )
    .eq("word_id", wordId)
    .neq("review_status", "rejected")
    .order("confidence", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as unknown as DictLinkRow[];
}
