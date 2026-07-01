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
import type { WordGrammarWithRule } from "./supabase";

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

function pct(part: number, whole: number): string {
  return whole > 0 ? `${((100 * part) / whole).toFixed(1)}%` : "n/a";
}

async function grammarConflictMetrics(): Promise<Metric[]> {
  const { data } = await supabase.from("word_grammar").select("*, grammar_rules(*)");
  const rows = (data ?? []) as unknown as WordGrammarWithRule[];

  const byWord = new Map<number, WordGrammarWithRule[]>();
  for (const row of rows) {
    const list = byWord.get(row.word_id) ?? [];
    list.push(row);
    byWord.set(row.word_id, list);
  }

  let conflicts = 0;
  let polysemy = 0;
  for (const wordRows of byWord.values()) {
    const view = buildGrammarView(wordRows);
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

export async function computeHealth(): Promise<HealthReport> {
  const [{ data: statsData }, grammarConflictM] = await Promise.all([
    supabase.rpc("health_stats"),
    grammarConflictMetrics(),
  ]);
  const s = statsData as HealthStats;

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
      label: "Sourced vs. rule-derived grammar",
      group: "Grammar",
      value: s.sourced_vs_rule.map((r) => ({
        provenance: r.provenance === "imported" ? "sourced (cited)" : "rule-derived",
        rows: r.rows,
        words: r.words,
      })),
    },
    {
      key: "sourced_only_words",
      label: "Words with sourced grammar the rule engine never touched",
      group: "Grammar",
      value: s.sourced_only_words,
      note: "Scholar-cited grammar (pad-arth) filling a gap the Japji-scoped rule engine doesn't cover.",
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

  return { generatedAt: new Date().toISOString(), metrics };
}
