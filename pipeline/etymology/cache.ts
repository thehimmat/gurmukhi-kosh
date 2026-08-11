/**
 * Persistent JSONL caches for external dictionary lookups (#47).
 *
 * A transient DSAL/MW failure used to cost a whole ~1h re-run because
 * responses were cached only in memory. Every clean lookup is appended to a
 * JSONL checkpoint under pipeline/etymology/output/ (gitignored, like the
 * Mahan Kosh scraper's), so re-runs fetch only misses and transient failures
 * self-heal across runs. Failed or partial lookups are never persisted.
 *
 * Format: one {"key": ..., "value": ...} object per line, append-only; on
 * load the last line for a key wins.
 */

import * as fs from "fs";
import * as path from "path";

const OUTPUT_DIR = "pipeline/etymology/output";

export function loadJsonlCache<T>(filename: string): Map<string, T> {
  const map = new Map<string, T>();
  const file = path.join(OUTPUT_DIR, filename);
  if (!fs.existsSync(file)) return map;
  for (const line of fs.readFileSync(file, "utf-8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const { key, value } = JSON.parse(line);
      map.set(key, value);
    } catch {
      // A truncated final line (process killed mid-append) is dropped; that
      // key simply refetches next run.
    }
  }
  return map;
}

export function appendJsonlCache<T>(filename: string, key: string, value: T): void {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.appendFileSync(path.join(OUTPUT_DIR, filename), JSON.stringify({ key, value }) + "\n");
}
