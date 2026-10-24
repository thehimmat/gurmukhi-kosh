// How old health_stats()' cached totals are (075). Only open flags and the source
// registries are counted live; everything else is as of the last refresh_health_stats(),
// which the ingests and refresh_computed_stats() run.

import type { Metric } from "./health";

function ago(seconds: number): string {
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86400)} d ago`;
}

export function statsAgeMetric(computedAt: string | null, ageSeconds: number | null): Metric {
  const base = {
    key: "stats_computed_at",
    label: "Totals last recomputed",
    group: "Freshness",
    note: "Everything but open flags and source counts is cached. An ingest refreshes it; by hand: select refresh_health_stats();",
  };
  if (computedAt === null || ageSeconds === null) return { ...base, value: "never", status: "warn" };
  return { ...base, value: `${ago(ageSeconds)} (${computedAt})`, status: "info" };
}
