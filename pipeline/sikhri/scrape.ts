/**
 * SikhRI dictionary scraper (gurugranthsahibdictionary.io) — Phase 1.
 *
 * The English entry pages are romanized-only, so the join back to our Gurmukhi
 * `words` table comes from the site's *Panjabi* glossary (indexed by Gurmukhi
 * letter). But the English detail page is fetched by SikhRI's *romanization*.
 * The two are bridged by the shared `wn` id:
 *   1. Walk the Panjabi glossary letters → (gurmukhi, wn), one per homograph;
 *      keep only entries whose Gurmukhi is in our `words` table.
 *   2. Walk the English glossary A–Z → (roman, wn); build a wn → roman map.
 *   3. Join on wn → (gurmukhi, roman, wn).
 *   4. Fetch the English detail /dictionary/english/ms/<roman>?wn=<wn>&<params>
 *      (the "wow" path is word-of-week only; "ms" needs the full query params)
 *      and parse meaning / grammar / etymology.
 *   5. Write pipeline/sikhri/output/entries.jsonl (checkpointed by wn).
 *
 * Usage (from gurmukhi-kosh project root):
 *   npx tsx pipeline/sikhri/scrape.ts                 # full run
 *   npx tsx pipeline/sikhri/scrape.ts --limit=50      # first 50 matched entries
 *   npx tsx pipeline/sikhri/scrape.ts --letters=ਕ,ਖ   # only these Panjabi letters
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Idempotent/resumable: already-scraped `wn`s are skipped.
 *
 * SikhRI's dictionary is © SikhRI, All Rights Reserved — scraped per the
 * proceed-and-acknowledge decision: polite rate limit, per-word lookups only,
 * not a bulk mirror, attributed, removable on request.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import * as fs from "fs";
import * as path from "path";
import { supabaseAdmin } from "../shared/db";
import { sleep, getArg } from "../shared/utils";
import { parseGlossaryCatalog, parseEntry, decodeWn } from "./parse";

const BASE = "https://gurugranthsahibdictionary.io";
const OUTPUT_PATH = "pipeline/sikhri/output/entries.jsonl";
const DELAY_MS = 400; // polite delay between requests
const ENGLISH_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// The English `ms` detail page only renders with SikhRI's full query-param set.
const MS_PARAMS =
  "searchType=wordmatch&source=Source&bani=Bani&rag=Rag&author=Author&grammar=Grammar&CollectionName=Grammar%20Category&SpecialHeading=Special%20Heading";

const HEADERS = { "User-Agent": "Mozilla/5.0 (gurmukhi-kosh research; non-commercial)" };

async function fetchText(url: string): Promise<string> {
  let backoff = 1500;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (res.status === 429 || res.status >= 500) {
        await sleep(backoff);
        backoff *= 2;
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    } catch (e) {
      if (attempt === 3) throw new Error(`fetch failed for ${url}: ${(e as Error).message}`);
      await sleep(backoff);
      backoff *= 2;
    }
  }
  throw new Error(`fetch failed for ${url}`);
}

function decodeHexEntities(s: string): string {
  return s
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

/** Gurmukhi glossary letters advertised on the Panjabi index page. */
async function getPanjabiLetters(): Promise<string[]> {
  const html = await fetchText(`${BASE}/home/panjabi/index`);
  const seen = new Set<string>();
  const re = /\/dictionary\/panjabi\/glossary\/([^"?]+)/g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const letter = decodeHexEntities(m[1]).trim();
    if (letter) seen.add(letter);
  }
  return [...seen];
}

async function fetchOurWords(db: ReturnType<typeof supabaseAdmin>): Promise<Set<string>> {
  const set = new Set<string>();
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db
      .from("words")
      .select("gurmukhi")
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`fetchOurWords: ${error.message}`);
    const batch = data ?? [];
    for (const r of batch) set.add((r as { gurmukhi: string }).gurmukhi);
    if (batch.length < PAGE) break;
  }
  return set;
}

function loadCheckpoint(p: string): Set<string> {
  const done = new Set<string>();
  if (!fs.existsSync(p)) return done;
  for (const line of fs.readFileSync(p, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      done.add(JSON.parse(t).wn);
    } catch {
      /* ignore malformed */
    }
  }
  return done;
}

interface Matched {
  gurmukhi: string;
  wn: string;
  roman: string;
}

async function main() {
  const db = supabaseAdmin();

  console.log("Fetching our word list from Supabase...");
  const ourWords = await fetchOurWords(db);
  console.log(`  ${ourWords.size} words in DB.`);

  // 1. Panjabi glossary → (gurmukhi, wn), filtered to our words.
  const lettersArg = getArg("letters");
  const paLetters = lettersArg
    ? lettersArg.split(",").map((s) => s.trim()).filter(Boolean)
    : await getPanjabiLetters();
  console.log(`Walking ${paLetters.length} Panjabi glossary letters...`);

  const gurmukhiByWn = new Map<string, string>(); // wn → gurmukhi (matched words only)
  for (let i = 0; i < paLetters.length; i++) {
    const html = await fetchText(`${BASE}/dictionary/panjabi/glossary/${encodeURIComponent(paLetters[i])}`);
    for (const e of parseGlossaryCatalog(html)) {
      if (ourWords.has(e.term)) gurmukhiByWn.set(e.wn, e.term);
    }
    process.stdout.write(`\r  Panjabi ${i + 1}/${paLetters.length}, matched wn: ${gurmukhiByWn.size}`);
    await sleep(DELAY_MS);
  }
  console.log(`\n  ${gurmukhiByWn.size} matched entries (wn) in our words.`);

  // 2. English glossary A–Z → wn → roman (only wn's we need).
  console.log(`Walking ${ENGLISH_LETTERS.length} English glossary letters for romanizations...`);
  const romanByWn = new Map<string, string>();
  for (let i = 0; i < ENGLISH_LETTERS.length; i++) {
    let html: string;
    try {
      html = await fetchText(`${BASE}/dictionary/english/glossary/${ENGLISH_LETTERS[i]}`);
    } catch {
      continue; // a missing letter page is not fatal
    }
    for (const e of parseGlossaryCatalog(html)) {
      if (gurmukhiByWn.has(e.wn) && !romanByWn.has(e.wn)) romanByWn.set(e.wn, e.term);
    }
    process.stdout.write(`\r  English ${i + 1}/${ENGLISH_LETTERS.length}, resolved roman: ${romanByWn.size}`);
    await sleep(DELAY_MS);
  }
  console.log(`\n  ${romanByWn.size}/${gurmukhiByWn.size} matched entries have an English romanization.`);

  // 3. Join.
  const matched: Matched[] = [];
  for (const [wn, gurmukhi] of gurmukhiByWn) {
    const roman = romanByWn.get(wn);
    if (roman) matched.push({ gurmukhi, wn, roman });
  }

  const done = loadCheckpoint(OUTPUT_PATH);
  const limit = getArg("limit");
  const todo = matched.filter((e) => !done.has(e.wn));
  const work = limit ? todo.slice(0, parseInt(limit, 10)) : todo;
  console.log(`Checkpoint: ${done.size} already scraped. Scraping ${work.length} entries...\n`);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const out = fs.createWriteStream(OUTPUT_PATH, { flags: "a" });

  let found = 0;
  let errors = 0;
  const t0 = Date.now();
  for (let i = 0; i < work.length; i++) {
    const e = work[i];
    try {
      const url = `${BASE}/dictionary/english/ms/${encodeURIComponent(e.roman)}?wn=${encodeURIComponent(e.wn)}&${MS_PARAMS}`;
      const html = await fetchText(url);
      const parsed = parseEntry(html);
      const hasContent = Boolean(parsed.meaning || parsed.grammar || parsed.etymology);
      out.write(
        JSON.stringify({
          gurmukhi: e.gurmukhi,
          wn: e.wn,
          wn_id: decodeWn(e.wn),
          found: hasContent,
          headword_roman: parsed.headwordRoman ?? e.roman,
          meaning: parsed.meaning,
          grammar: parsed.grammar,
          etymology: parsed.etymology,
          source_url: `${BASE}/dictionary/english/ms/${encodeURIComponent(e.roman)}?wn=${e.wn}`,
        }) + "\n"
      );
      if (hasContent) found++;
    } catch (err) {
      errors++;
      console.error(`\n  ${(err as Error).message} — will retry next run`);
    }
    const elapsed = (Date.now() - t0) / 1000;
    const eta = ((work.length - i - 1) * elapsed) / (i + 1);
    process.stdout.write(
      `\r[${elapsed.toFixed(0)}s] ${i + 1}/${work.length} | found:${found} errors:${errors} | ETA:${eta.toFixed(0)}s`
    );
    await sleep(DELAY_MS);
  }
  out.end();
  console.log(`\n\nDone. found:${found} errors:${errors} → ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
