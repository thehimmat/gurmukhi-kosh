/**
 * Writes the SQL that loads SikhRI's crawls into dict_entries (migration 070), every entry whether or
 * not the Kosh has the word. Curator-only until SikhRI gives guidance (source_rights 'sikhri', #40).
 *
 *   npx tsx pipeline/sikhri/load-entries.ts [--en=…/entries.jsonl] [--pa=…/entries-pa.jsonl] [--out=dir]
 *
 * Run the numbered files in order (Supabase MCP execute_sql, or psql), then verify.sql: its n and
 * checksum must equal the ones printed here. Re-running is safe: entries upsert by entry_ref.
 */
import * as fs from "fs";
import * as path from "path";
import { getArg } from "../shared/utils";
import { dictEntriesLoadSql, dictEntriesVerifySql } from "../shared/dict-entries";
import { sikhriEntries, type SikhriEnLine, type SikhriPaLine } from "./entries";

const readJsonl = <T,>(p: string): T[] =>
  fs.existsSync(p)
    ? fs.readFileSync(p, "utf-8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as T)
    : [];

function main() {
  const enPath = getArg("en") ?? "pipeline/sikhri/output/entries.jsonl";
  const paPath = getArg("pa") ?? "pipeline/sikhri/output/entries-pa.jsonl";
  const out = getArg("out") ?? "pipeline/sikhri/output/sql";

  const en = readJsonl<SikhriEnLine>(enPath);
  const pa = readJsonl<SikhriPaLine>(paPath);
  if (en.length + pa.length === 0) throw new Error(`no crawl found at ${enPath} or ${paPath}`);
  const entries = sikhriEntries(en, pa);
  const { statements, checksum } = dictEntriesLoadSql("sikhri", entries, { batchSize: 250 });

  fs.mkdirSync(out, { recursive: true });
  statements.forEach((s, i) => fs.writeFileSync(path.join(out, `${String(i + 1).padStart(3, "0")}.sql`), s + "\n"));
  fs.writeFileSync(path.join(out, "verify.sql"), dictEntriesVerifySql("sikhri") + ";\n");

  const gurmukhi = entries.filter((e) => e.headword_gurmukhi).length;
  console.log(`English lines: ${en.length} · Panjabi lines: ${pa.length}`);
  console.log(`Entries: ${entries.length} (${gurmukhi} with a Gurmukhi headword, ${entries.length - gurmukhi} romanized only)`);
  console.log(`Wrote ${statements.length} statements + verify.sql to ${out}`);
  console.log(`Expected after load: n = ${entries.length}, checksum = ${checksum}`);
}

main();
