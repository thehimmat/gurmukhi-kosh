// Data-quality / coverage stats for the /health dashboard. Recomputed live on
// every load (no snapshot table) so it always reflects the current database.
//
// Most metrics come from the `health_stats()` Postgres RPC (013_health_stats.sql) —
// PostgREST can't express distinct-counts or group-bys directly, so that single
// call returns every pure-SQL aggregate as one jsonb blob. The one metric that
// needs TS logic (grammar_conflicts / polysemy) reuses buildGrammarView, the same
// provenance-aware view the word page renders, so the counts here can never
// diverge from what a reader sees on a word page.
//
// Adding a new datapoint = push one more Metric into the array computeHealth() builds.

import { supabase } from "./supabase";
import { buildGrammarView } from "./grammar-view";
import { fetchAllRows } from "./fetch-all-rows";
import { fetchPosMap } from "./word-data";
import type { WordGrammarWithRule } from "./supabase";
import legendJson from "../pipeline/mahan-kosh/abbreviations.json";

// Single source of truth for the expected parse stamp: the legend's _meta
// (the same file the Python parser reads), so app and pipeline can't drift.
const MK_PARSE_VERSION: string =
  ((legendJson as Record<string, unknown>)._meta as { parse_version?: string })
    ?.parse_version ?? "0";

export type MetricStatus = "ok" | "warn" | "info";
export type Row = Record<string, string | number>;

export interface Metric {
  key: string;
  label: string;
  group: string;
  value: number | string | Row[];
  status?: MetricStatus;
  note?: string;
}

export interface HealthReport {
  generatedAt: string;
  metrics: Metric[];
}

type HealthStats = {
  total_words: number;
  total_lines: number;
  total_angs: number;
  total_occurrences: number;
  dict_sources_registered: number;
  translation_sources_registered: number;

  lines_per_source: { source_code: string; rows: number; lines: number }[];
  lines_with_no_commentary: number;
  empty_bodies: number;

  definitions_total: number;
  words_with_definition: number;
  words_without_definition: number;
  definitions_per_source: { code: string; name: string; rows: number; words: number }[];
  words_with_definition_but_no_pos: number;

  word_grammar_total: number;
  words_with_any_grammar: number;
  sourced_vs_rule: { provenance: string; rows: number; words: number }[];
  sourced_only_words: number;
  grammar_unreviewed: number;

  etymology_total: number;
  words_with_etymology: number;

  dup_line_source: number;
  orphan_grammar: number;
  orphan_definitions: number;
  provenance_breakdown: { table_name: string; provenance: string; rows: number }[];
  review_status_breakdown: { table_name: string; review_status: string; rows: number }[];

  open_flags_total: number;
  open_flags_by_target: { target: string; rows: number }[];
  open_flags_by_type: { flag_type: string; rows: number }[];
};

// word_grammar provenance → what it means for a grammar row (#30: every row is
// read from a named source). An unexpected value shows raw, so it stands out.
const GRAMMAR_PROVENANCE_LABEL: Record<string, string> = {
  imported: "scholar-cited (pad-arth, Shackle)",
  scraped: "Mahan Kosh part-of-speech marker",
};

function pct(part: number, whole: number): string {
  return whole > 0 ? `${((100 * part) / whole).toFixed(1)}%` : "n/a";
}

async function grammarConflictMetrics(): Promise<Metric[]> {
  // word_grammar is 20k+ rows; unpaginated, the conflict counts would silently
  // cover ~5% of it.
  const [rows, posMap] = await Promise.all([
    fetchAllRows<WordGrammarWithRule>("word_grammar", () =>
      supabase.from("word_grammar").select("*, grammar_rules(*)").order("id", { ascending: true })
    ),
    fetchPosMap(),
  ]);

  const byWord = new Map<number, WordGrammarWithRule[]>();
  for (const row of rows) {
    const list = byWord.get(row.word_id) ?? [];
    list.push(row);
    byWord.set(row.word_id, list);
  }

  let conflicts = 0;
  let polysemy = 0;
  for (const wordRows of byWord.values()) {
    const view = buildGrammarView(wordRows, posMap);
    if (view.some((a) => a.conflict)) conflicts++;
    if (view.some((a) => a.polysemy)) polysemy++;
  }

  return [
    {
      key: "grammar_conflicts",
      label: "Words with a cross-source grammar conflict",
      group: "Grammar",
      value: conflicts,
      status: "info",
      note: "Sources disagree on an attribute (e.g. Mahan Kosh vs. a Viakaran rule). Flagged, not hidden, on the word page.",
    },
    {
      key: "grammar_polysemy",
      label: "Words with polysemous grammar (same source, multiple senses)",
      group: "Grammar",
      value: polysemy,
      status: "info",
    },
  ];
}

// Rows whose parsed stamp differs from the current parse_version (issue #46).
// PostgREST can't express IS DISTINCT FROM, so: stale = total Mahan Kosh rows
// (from the RPC's per-source breakdown) minus rows stamped with the current
// version — which correctly counts parsed=null and missing-stamp rows as stale.
async function mkParseStalenessMetric(s: HealthStats): Promise<Metric[]> {
  const mk = s.definitions_per_source.find((r) => r.code === "mahan_kosh");
  if (!mk) return [];
  const { data: src } = await supabase
    .from("dict_sources")
    .select("id")
    .eq("code", "mahan_kosh")
    .single();
  if (!src) return [];
  const { count } = await supabase
    .from("definitions")
    .select("id", { count: "exact", head: true })
    .eq("dict_source_id", src.id)
    .eq("parsed->>parser_version", MK_PARSE_VERSION);
  const stale = mk.rows - (count ?? 0);
  return [
    {
      key: "mk_parse_stale",
      label: "Mahan Kosh rows without the current structured parse",
      group: "Definitions",
      value: stale,
      status: stale === 0 ? "ok" : "warn",
      note: `Expected parse version ${MK_PARSE_VERSION}. Nonzero means the parser or legend changed without the ~1 min re-run (parse_shorthand.py --run + ingest:mahankosh).`,
    },
  ];
}

// Inline-numbered senses (#140). Before normalize.py's splitter runs, a
// numeral after a citation, line break or sentence end is almost always a
// later sense bundled into the row; after it, what remains is numbered lists
// inside a sense and the numerals listed in sense_split_report.jsonl.
const MK_INLINE_NUMERAL = "[.)\"#।][[:space:]]*[੧-੯][੦-੯]?[.][[:space:]]";

async function mkSenseSplitMetrics(): Promise<Metric[]> {
  const { data: src } = await supabase
    .from("dict_sources")
    .select("id")
    .eq("code", "mahan_kosh")
    .single();
  if (!src) return [];
  const [{ count: inline }, { count: split }] = await Promise.all([
    supabase
      .from("definitions")
      .select("id", { count: "exact", head: true })
      .eq("dict_source_id", src.id)
      .filter("definition_text", "match", MK_INLINE_NUMERAL),
    supabase
      .from("definitions")
      .select("id", { count: "exact", head: true })
      .eq("dict_source_id", src.id)
      .not("parsed->>split_from", "is", null),
  ]);
  return [
    {
      key: "mk_inline_numerals",
      label: "Mahan Kosh rows with an inline numbered item",
      group: "Definitions",
      value: inline ?? 0,
      status: "info",
      note: "Numbered lists inside a sense stay inline by design; numerals the splitter declined are in pipeline/mahan-kosh/output/sense_split_report.jsonl.",
    },
    {
      key: "mk_split_senses",
      label: "Mahan Kosh senses split out of a bundled row",
      group: "Definitions",
      value: split ?? 0,
      status: "info",
      note: "Rows normalize.py cut at a printed sense numeral (#140); each carries parsed.split_from.",
    },
  ];
}

export async function computeHealth(): Promise<HealthReport> {
  const [{ data: statsData }, grammarConflictM] = await Promise.all([
    supabase.rpc("health_stats"),
    grammarConflictMetrics(),
  ]);
  const s = statsData as HealthStats;
  const [mkParseM, mkSplitM] = await Promise.all([mkParseStalenessMetric(s), mkSenseSplitMetrics()]);

  const metrics: Metric[] = [
    // Corpus / ingest
    { key: "total_words", label: "Unique words indexed", group: "Corpus", value: s.total_words },
    { key: "total_lines", label: "Lines ingested", group: "Corpus", value: s.total_lines },
    { key: "total_angs", label: "Angs covered", group: "Corpus", value: s.total_angs, status: s.total_angs === 1430 ? "ok" : "warn" },
    { key: "total_occurrences", label: "Word occurrences", group: "Corpus", value: s.total_occurrences },
    { key: "dict_sources_registered", label: "Dictionary sources registered", group: "Corpus", value: s.dict_sources_registered },
    { key: "translation_sources_registered", label: "Commentary/translation sources registered", group: "Corpus", value: s.translation_sources_registered },

    // Commentaries
    {
      key: "lines_per_source",
      label: "Lines per commentary source",
      group: "Commentaries",
      value: s.lines_per_source.map((r) => ({
        source: r.source_code,
        lines: r.lines,
        coverage: pct(r.lines, s.total_lines),
      })),
    },
    {
      key: "lines_with_no_commentary",
      label: "Lines with zero commentary",
      group: "Commentaries",
      value: s.lines_with_no_commentary,
      status: s.lines_with_no_commentary > 60 ? "warn" : "info",
      note: "The known ~55 are non-content: Raag Mala, headers, chhaka counters, dhuni directions.",
    },
    {
      key: "empty_bodies",
      label: "Commentary rows with empty text",
      group: "Commentaries",
      value: s.empty_bodies,
      status: s.empty_bodies === 0 ? "ok" : "warn",
    },

    // Definitions
    { key: "definitions_total", label: "Definitions total", group: "Definitions", value: s.definitions_total },
    { key: "words_with_definition", label: "Words with a definition", group: "Definitions", value: s.words_with_definition },
    {
      key: "words_without_definition",
      label: "Words with no definition",
      group: "Definitions",
      value: `${s.words_without_definition} (${pct(s.words_without_definition, s.total_words)})`,
      status: "info",
      note: "Core coverage gap — motivates a second definitions source (Guru Granth Kosh / SikhRI, both pending terms).",
    },
    {
      key: "definitions_per_source",
      label: "Definitions per dictionary source",
      group: "Definitions",
      value: s.definitions_per_source.map((r) => ({ source: r.name, definitions: r.rows, words: r.words })),
    },
    {
      key: "words_with_definition_but_no_pos",
      label: "Words with a definition but no part-of-speech",
      group: "Definitions",
      value: s.words_with_definition_but_no_pos,
      status: "info",
    },

    // Grammar
    { key: "word_grammar_total", label: "Grammar rows total", group: "Grammar", value: s.word_grammar_total },
    { key: "words_with_any_grammar", label: "Words with any grammar", group: "Grammar", value: s.words_with_any_grammar },
    {
      key: "sourced_vs_rule",
      label: "Grammar by source type",
      group: "Grammar",
      value: s.sourced_vs_rule.map((r) => ({
        provenance: GRAMMAR_PROVENANCE_LABEL[r.provenance] ?? r.provenance,
        rows: r.rows,
        words: r.words,
      })),
    },
    {
      key: "sourced_only_words",
      label: "Words with scholar-cited grammar and no Mahan Kosh marker",
      group: "Grammar",
      value: s.sourced_only_words,
      note: "Grammar from Sahib Singh's pad-arth or Shackle on words whose Mahan Kosh entry gives no part-of-speech marker.",
    },
    ...grammarConflictM,
    { key: "grammar_unreviewed", label: "Grammar rows awaiting scholar review", group: "Grammar", value: s.grammar_unreviewed, status: "info" },

    // Etymology (P5 — currently empty)
    {
      key: "etymology_total",
      label: "Etymology entries",
      group: "Etymology",
      value: s.etymology_total,
      status: s.etymology_total === 0 ? "info" : "ok",
      note: s.etymology_total === 0 ? "Not yet built (P5) — pending Mahan Kosh origin markers → Cologne/DSAL." : undefined,
    },
    { key: "words_with_etymology", label: "Words with etymology", group: "Etymology", value: s.words_with_etymology },

    // Provenance / integrity checks
    { key: "dup_line_source", label: "Duplicate (line, source) commentary rows", group: "Integrity", value: s.dup_line_source, status: s.dup_line_source === 0 ? "ok" : "warn" },
    { key: "orphan_grammar", label: "Grammar rows pointing at a missing word", group: "Integrity", value: s.orphan_grammar, status: s.orphan_grammar === 0 ? "ok" : "warn" },
    { key: "orphan_definitions", label: "Definitions pointing at a missing word", group: "Integrity", value: s.orphan_definitions, status: s.orphan_definitions === 0 ? "ok" : "warn" },
    {
      key: "provenance_breakdown",
      label: "Provenance breakdown",
      group: "Integrity",
      value: s.provenance_breakdown.map((r) => ({ table: r.table_name, provenance: r.provenance, rows: r.rows })),
    },
    {
      key: "review_status_breakdown",
      label: "Review status breakdown",
      group: "Integrity",
      value: s.review_status_breakdown.map((r) => ({ table: r.table_name, status: r.review_status, rows: r.rows })),
    },

    // Curation (P4 — community flagging)
    {
      key: "open_flags_total",
      label: "Open flags awaiting review",
      group: "Curation",
      value: s.open_flags_total,
      status: s.open_flags_total > 0 ? "info" : "ok",
      note: "Submitted via the word page; review at /admin/flags.",
    },
    {
      key: "open_flags_by_target",
      label: "Open flags by target",
      group: "Curation",
      value: s.open_flags_by_target.map((r) => ({ target: r.target, count: r.rows })),
    },
    {
      key: "open_flags_by_type",
      label: "Open flags by type",
      group: "Curation",
      value: s.open_flags_by_type.map((r) => ({ type: r.flag_type, count: r.rows })),
    },
  ];
  metrics.push(...mkParseM, ...mkSplitM);

  return { generatedAt: new Date().toISOString(), metrics };
}
