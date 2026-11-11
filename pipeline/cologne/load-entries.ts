/**
 * Writes the SQL that loads one Cologne (csl-orig) dictionary into dict_entries (migration 089).
 *
 *   git clone --depth 1 https://github.com/sanskrit-lexicon/csl-orig ../csl-orig
 *   npm run load:cologne -- --dict=mw [--csl=../csl-orig] [--out=pipeline/cologne/output/mw]
 *
 * Run the numbered files in order (psql), then verify.sql: its n and checksum must equal the ones
 * printed here. Re-running is safe: entries upsert by entry_ref. The source must be registered first
 * (090 for mw, 091 for the rest); see codes.ts.
 */
import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import { getArg } from "../shared/utils";
import { dictEntriesLoadSql, dictEntriesVerifySql } from "../shared/dict-entries";
import { parseCsl } from "./parse";
import { cologneEntries } from "./entries";
import { COLOGNE_CODES } from "./codes";


function main() {
  const dict = getArg("dict") ?? "mw";
  const code = COLOGNE_CODES[dict];
  if (!code) throw new Error(`no source code for csl-orig dictionary "${dict}" (COLOGNE_CODES)`);
  const csl = getArg("csl") ?? "../csl-orig";
  const out = getArg("out") ?? `pipeline/cologne/output/${dict}`;

  const file = path.join(csl, "v02", dict, `${dict}.txt`);
  const entries = cologneEntries(code, parseCsl(fs.readFileSync(file, "utf-8")));
  const { statements, checksum } = dictEntriesLoadSql(code, entries, { batchSize: 1000 });

  fs.mkdirSync(out, { recursive: true });
  statements.forEach((s, i) => fs.writeFileSync(path.join(out, `${String(i + 1).padStart(4, "0")}.sql`), s + "\n"));
  fs.writeFileSync(path.join(out, "verify.sql"), dictEntriesVerifySql(code) + ";\n");

  let commit = "unknown";
  try {
    commit = execFileSync("git", ["-C", csl, "rev-parse", "HEAD"], { encoding: "utf-8" }).trim();
  } catch {
    // not a git checkout
  }
  const linkable = entries.filter((e) => e.headword_gurmukhi).length;
  console.log(`${code} from csl-orig ${commit}`);
  console.log(`Entries: ${entries.length} (${linkable} with a Gurmukhi spelling to link on)`);
  console.log(`Wrote ${statements.length} statements + verify.sql to ${out}`);
  console.log(`Expected after load: n = ${entries.length}, checksum = ${checksum}`);
}

main();
