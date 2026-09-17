/**
 * Classifier audit: runs extractNumerals over every corpus line and reports
 * the role distribution plus a sample of each bucket.
 *
 * This is the check that the role rules hold on real text rather than on the
 * hand-picked cases in tests/gurmukhi-numerals.test.ts. It writes nothing —
 * run it before and after touching the keyword lists or the danda rule.
 *
 *   npx tsx pipeline/numbers/validate.ts [--role=heading_other] [--samples=40]
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { extractNumerals, type NumeralRole } from "../../lib/gurmukhi-numerals";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith("--role="))?.split("=")[1] as
  | NumeralRole
  | undefined;
const sampleCount = Number(
  args.find((a) => a.startsWith("--samples="))?.split("=")[1] ?? 25
);

async function main() {
  const byRole = new Map<NumeralRole, number>();
  // Distinct line shapes per role, so the sample is not 400 copies of
  // "ਆਸਾ ਮਹਲਾ ੫ ॥".
  const samples = new Map<NumeralRole, Map<string, number>>();
  const keywordCounts = new Map<string, number>();

  let lines = 0;
  let numerals = 0;
  const PAGE = 1000;

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("lines")
      .select("gurmukhi")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];

    for (const row of batch) {
      lines++;
      const text = (row as { gurmukhi: string }).gurmukhi;
      for (const n of extractNumerals(text)) {
        numerals++;
        byRole.set(n.role, (byRole.get(n.role) ?? 0) + 1);
        if (n.keyword) {
          keywordCounts.set(n.keyword, (keywordCounts.get(n.keyword) ?? 0) + 1);
        }
        if (!samples.has(n.role)) samples.set(n.role, new Map());
        const bucket = samples.get(n.role)!;
        bucket.set(text, (bucket.get(text) ?? 0) + 1);
      }
    }

    if (batch.length < PAGE) break;
  }

  console.log(`Lines scanned:      ${lines.toLocaleString()}`);
  console.log(`Numerals found:     ${numerals.toLocaleString()}\n`);

  console.log("Role distribution");
  for (const [role, n] of [...byRole.entries()].sort((a, b) => b[1] - a[1])) {
    const pct = ((n / numerals) * 100).toFixed(1).padStart(5);
    console.log(`  ${role.padEnd(15)} ${String(n).padStart(7)}  ${pct}%`);
  }

  console.log("\nKeywords matched");
  for (const [kw, n] of [...keywordCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${kw.padEnd(14)} ${String(n).padStart(6)}`);
  }

  const roles = only ? [only] : ([...samples.keys()] as NumeralRole[]);
  for (const role of roles) {
    const bucket = samples.get(role);
    if (!bucket) continue;
    const distinct = [...bucket.entries()].sort((a, b) => b[1] - a[1]);
    console.log(
      `\n--- ${role}: ${distinct.length.toLocaleString()} distinct line shapes, top ${sampleCount} ---`
    );
    for (const [text, n] of distinct.slice(0, sampleCount)) {
      console.log(`  ${String(n).padStart(5)}x  ${text}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
