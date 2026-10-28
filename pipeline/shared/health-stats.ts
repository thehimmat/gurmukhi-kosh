/**
 * Rebuilds the /health totals (health_stats_cache, migration 075) after an ingest. The cache only
 * changes when this runs, so every script that writes words, lines, line_translations,
 * definitions, word_grammar or etymology ends with it. It takes ~17 s on production; the function
 * raises its own statement timeout past PostgREST's 8 s.
 */

type RpcDb = {
  rpc(fn: "refresh_health_stats"): PromiseLike<{ error: { message: string } | null }>;
};

export async function refreshHealthStats(db: RpcDb): Promise<void> {
  const { error } = await db.rpc("refresh_health_stats");
  if (error) {
    throw new Error(
      `refresh_health_stats failed: ${error.message}\n` +
        "The /health totals are stale until it runs. Re-run it directly (SQL: select refresh_health_stats();)."
    );
  }
}
