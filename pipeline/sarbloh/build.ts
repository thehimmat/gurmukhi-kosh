/**
 * Build the Sri Sarbloh Granth corpus lines (see lines.ts and supabase/migrations/038).
 *
 *   npx tsx pipeline/sarbloh/build.ts <out.json>
 *
 * Reads pipeline/scans/data/sarbloh/budha-dal-typed.txt (pages split by form feeds) and
 * canon-bd.json (the Granth's canonical half-lines), and writes
 *   { "sarbloh_budha_dal": Line[] }
 * with Line = { verse_id, ang, line_no, gurmukhi }, ready to load into `lines`: the Manglacharan
 * Purana and Adhyays 1-5 (pages 1-818, slip-corrected) followed by the avatar section that Budha Dal
 * prints as part of the Granth (pages 819-1028, typed text as is). See migrations 038 and 039.
 * Also prints the token counts lib/tokenizer gives, to check the load against.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { tokenize } from "../../lib/tokenizer";
import { dropPageNumbers, splitPagedPadas, toLines, type PagedPada } from "./lines";

const DATA = "pipeline/scans/data/sarbloh";
/** The Granth ends with "ਸੁਧ" after the colophon of Adhyay 5; the avatars follow on the next page. */
const GRANTH_HALF_LINES = 27751;

const out = process.argv[2];
if (!out) {
  console.error("usage: build.ts <out.json>");
  process.exit(1);
}

const paged = splitPagedPadas(readFileSync(`${DATA}/budha-dal-typed.txt`, "utf8").split("\f"));
const canon = JSON.parse(readFileSync(`${DATA}/canon-bd.json`, "utf8")) as Array<{ text: string; ref: string | null }>;

const granth: PagedPada[] = paged
  .slice(0, GRANTH_HALF_LINES)
  .map((p, i) => (i < canon.length ? { ...p, text: dropPageNumbers(canon[i].text, p.text) } : p));
// The last half-line is the publisher's back page.
const avatars = paged.slice(GRANTH_HALF_LINES, -1);

const lines = toLines([...granth, ...avatars]);
const result = { sarbloh_budha_dal: lines.map((l, k) => ({ verse_id: k + 1, ang: l.ang, line_no: k + 1, gurmukhi: l.gurmukhi })) };
const tokens = lines.flatMap((l) => tokenize(l.gurmukhi));
const dropped = lines.filter((l) => l.dropped).map((l) => `${l.ang}: ${l.dropped!.join("")} in ${l.gurmukhi}`);
console.log(JSON.stringify({ lines: lines.length, pages: `${lines[0].ang}-${lines.at(-1)!.ang}`, tokens: tokens.length, distinct: new Set(tokens).size, droppedChars: dropped.length }));
for (const d of dropped) console.log("  dropped", d);
writeFileSync(out, JSON.stringify(result));
