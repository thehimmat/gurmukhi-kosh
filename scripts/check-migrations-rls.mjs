// Static lint: every table created by the migrations that shaped the shared
// Supabase project must have RLS enabled by some migration. Catches the
// migration-018 failure mode where tables shipped without the
// `enable row level security` boilerplate and were left publicly writable
// via PostgREST.
//
// Scans this repo's supabase/migrations/ plus the vendored copies of the
// sibling repos' historical migrations (supabase/migrations-imported/) —
// gurmukhi-search and gurmukhi-voice-search ran against the same database
// and previously bypassed this gate entirely (see supabase/APPLIED.md).
//
// Usage: node scripts/check-migrations-rls.mjs [migrations-dir ...]

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dirs =
  process.argv.length > 2
    ? process.argv.slice(2)
    : [
        "supabase/migrations",
        "supabase/migrations-imported/gurmukhi-search",
        "supabase/migrations-imported/gurmukhi-voice-search",
      ];

const stripName = (raw) =>
  raw.replace(/^public\./, "").replaceAll('"', "").toLowerCase();

const created = new Map(); // table -> file it was created in
const rlsEnabled = new Set();

for (const dir of dirs) {
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(dir, file), "utf8")
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");

    for (const m of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?([a-zA-Z_."]+)/gi
    )) {
      const table = stripName(m[1]);
      if (!created.has(table)) created.set(table, join(dir, file));
    }
    for (const m of sql.matchAll(
      /alter\s+table\s+(?:only\s+)?([a-zA-Z_."]+)\s+enable\s+row\s+level\s+security/gi
    )) {
      rlsEnabled.add(stripName(m[1]));
    }
  }
}

const missing = [...created].filter(([table]) => !rlsEnabled.has(table));

if (missing.length > 0) {
  console.error("FAIL: tables created without `enable row level security`:\n");
  for (const [table, file] of missing) {
    console.error(`  ${table} (created in ${file})`);
  }
  console.error(
    "\nAdd `alter table <name> enable row level security;` plus the needed" +
      " policies (see migration 022 for the pattern)."
  );
  process.exit(1);
}

console.log(
  `OK: all ${created.size} tables across ${dirs.length} migration dir(s) have RLS enabled.`
);
