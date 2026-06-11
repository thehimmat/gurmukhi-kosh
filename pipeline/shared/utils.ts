/** Shared utilities for all pipeline ingestion scripts. */

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function parseArgs(defaults: { start?: number; end?: number; source?: string } = {}): {
  start: number;
  end: number;
  sourceCode: string;
} {
  const args = process.argv.slice(2);
  let start = defaults.start ?? 1;
  let end = defaults.end ?? 1430;
  let sourceCode = defaults.source ?? "sggs_banidb_v2";

  for (const arg of args) {
    if (arg.startsWith("--start=")) start = parseInt(arg.split("=")[1]);
    if (arg.startsWith("--end=")) end = parseInt(arg.split("=")[1]);
    if (arg.startsWith("--source=")) sourceCode = arg.split("=")[1];
  }
  return { start, end, sourceCode };
}

/**
 * Generic `--key=value` reader. Returns the value, "" for a bare `--key`,
 * or undefined if absent. Used for flags like `--word-set=japji`, `--set=...`.
 */
export function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
    if (arg === `--${name}`) return "";
  }
  return undefined;
}

export function progress(current: number, total: number, startTime: number, label = "") {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const pct = ((current / total) * 100).toFixed(1);
  process.stdout.write(`\r[${elapsed}s] ${label}${current}/${total} (${pct}%)`);
}
