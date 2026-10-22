/**
 * SikhRI dictionary scraper (gurugranthsahibdictionary.io).
 *
 * Since 2026-10-21 (#40) this crawls every entry, not only those whose Gurmukhi is already a Kosh
 * word. The data is curator-only (source_rights 'sikhri', migration 069) until SikhRI gives guidance.
 *
 * The English entry pages are romanized-only; the Gurmukhi comes from the site's *Panjabi* glossary
 * (indexed by Gurmukhi letter). The two are bridged by the shared `wn` id (pipeline/sikhri/plan.ts):
 *   1. Walk the Panjabi glossary letters → (gurmukhi, wn), one per homograph.
 *   2. Walk the English glossary A–Z → (roman, wn).
 *   3. Join on wn. English-only entries are kept with gurmukhi = null; Panjabi-only entries can't be
 *      fetched (the detail page needs the romanization) and are reported.
 *   4. Fetch each English detail page /dictionary/english/ms/<roman>?wn=<wn>&<params> and parse
 *      meaning / grammar / etymology.
 *   5. Append to the output JSONL (checkpointed by wn).
 *
 * Usage (from gurmukhi-kosh project root):
 *   npx tsx pipeline/sikhri/scrape.ts                     # full crawl, no credentials needed
 *   npx tsx pipeline/sikhri/scrape.ts --limit=50          # first 50 entries
 *   npx tsx pipeline/sikhri/scrape.ts --letters=ਕ,ਖ       # only these Panjabi letters
 *   npx tsx pipeline/sikhri/scrape.ts --out=/tmp/x.jsonl  # write elsewhere (default pipeline/sikhri/output/)
 *   npx tsx pipeline/sikhri/scrape.ts --lang=pa           # Panjabi pages instead (→ entries-pa.jsonl)
 *   npx tsx pipeline/sikhri/scrape.ts --known-only        # old behaviour: only words already in the Kosh
 *                                                         # (needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
 * Idempotent/resumable: already-scraped `wn`s are skipped.
 *
 * SikhRI's dictionary is © SikhRI, all rights reserved. Crawled for curator-only research per the
 * 2026-10-21 decision (#40): one request at a time with a delay, attributed, removable with
 * `npm run teardown -- --source=sikhri`. robots.txt (checked 2026-10-21) blocks AI-training crawlers
 * and sets no rule for other agents.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import * as fs from "fs";
import * as path from "path";
import { supabaseAdmin } from "../shared/db";
import { sleep, getArg } from "../shared/utils";
import { fetchAllRows } from "../../lib/fetch-all-rows";
import { parseGlossaryCatalog, parseEntry, decodeWn, type CatalogEntry } from "./parse";
import { planCrawl, refreshGurmukhi, panjabiEntryUrl } from "./plan";

const BASE = "https://gurugranthsahibdictionary.io";
const OUTPUT_PATH = getArg("out") ?? "pipeline/sikhri/output/entries.jsonl";
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

// Vowel-initial and rare initials have glossary pages the index doesn't link (found 2026-10-21:
// ਉ 106, ਊ 18, ਓ 15, ਇ 114, ਈ 3, ਏ 108, ਐ 7, ਆ 146, ਙ ਣ ੜ 1 each).
const UNLISTED_PA_LETTERS = ["ਆ", "ਇ", "ਈ", "ਉ", "ਊ", "ਏ", "ਐ", "ਓ", "ਔ", "ਙ", "ਣ", "ੜ"];

/** Gurmukhi glossary letters: those on the Panjabi index page plus the unlisted ones. */
async function getPanjabiLetters(): Promise<string[]> {
  const html = await fetchText(`${BASE}/home/panjabi/index`);
  const seen = new Set<string>();
  const re = /\/dictionary\/panjabi\/glossary\/([^"?]+)/g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const letter = decodeHexEntities(m[1]).trim();
    if (letter) seen.add(letter);
  }
  for (const l of UNLISTED_PA_LETTERS) seen.add(l);
  return [...seen];
}

async function fetchOurWords(db: ReturnType<typeof supabaseAdmin>): Promise<Set<string>> {
  const rows = await fetchAllRows<{ gurmukhi: string }>("fetchOurWords", () =>
    db.from("words").select("gurmukhi").order("id", { ascending: true })
  );
  return new Set(rows.map((r) => r.gurmukhi));
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

async function main() {
  // Full crawl by default (#40, 2026-10-21): every entry, curator-only until SikhRI gives guidance.
  // --known-only restores the old filter to words already in the Kosh (needs Supabase credentials).
  const knownOnly = process.argv.includes("--known-only");
  const ourWords = knownOnly ? await fetchOurWords(supabaseAdmin()) : null;
  if (ourWords) console.log(`Known-only crawl: ${ourWords.size} words in DB.`);

  // 1. Panjabi glossary → (gurmukhi, wn).
  const lettersArg = getArg("letters");
  const paLetters = lettersArg
    ? lettersArg.split(",").map((s) => s.trim()).filter(Boolean)
    : await getPanjabiLetters();
  console.log(`Walking ${paLetters.length} Panjabi glossary letters...`);
  const panjabi: CatalogEntry[] = [];
  for (let i = 0; i < paLetters.length; i++) {
    const html = await fetchText(`${BASE}/dictionary/panjabi/glossary/${encodeURIComponent(paLetters[i])}`);
    panjabi.push(...parseGlossaryCatalog(html));
    process.stdout.write(`\r  Panjabi ${i + 1}/${paLetters.length}, entries: ${panjabi.length}`);
    await sleep(DELAY_MS);
  }

  if (getArg("lang") === "pa") return crawlPanjabi(panjabi, ourWords);

  // 2. English glossary A–Z → (roman, wn). Skipped letters are not fatal.
  console.log(`\nWalking ${ENGLISH_LETTERS.length} English glossary letters for romanizations...`);
  const english: CatalogEntry[] = [];
  for (let i = 0; i < ENGLISH_LETTERS.length; i++) {
    try {
      english.push(...parseGlossaryCatalog(await fetchText(`${BASE}/dictionary/english/glossary/${ENGLISH_LETTERS[i]}`)));
    } catch {
      /* a missing letter page is not fatal */
    }
    process.stdout.write(`\r  English ${i + 1}/${ENGLISH_LETTERS.length}, entries: ${english.length}`);
    await sleep(DELAY_MS);
  }

  // 3. Join on wn.
  const plan = planCrawl(panjabi, english, ourWords);
  console.log(`\n  ${plan.entries.length} entries to fetch; ${plan.unfetchable.length} Panjabi-only entries have no romanization to fetch by.`);
  if (lettersArg && !knownOnly) {
    // A letter-limited run walks every English letter, so keep only the entries from those letters.
    const wanted = new Set(panjabi.map((e) => e.wn));
    plan.entries = plan.entries.filter((e) => wanted.has(e.wn));
  }
  const matched = plan.entries;

  // Lines crawled before their Gurmukhi was known get it now (unlisted letters, homographs).
  if (fs.existsSync(OUTPUT_PATH)) {
    const old = fs.readFileSync(OUTPUT_PATH, "utf-8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
    const { lines, updated } = refreshGurmukhi(old, plan);
    if (updated > 0) {
      fs.writeFileSync(OUTPUT_PATH, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
      console.log(`Filled in Gurmukhi on ${updated} already-crawled entries.`);
    }
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
          ...(e.gurmukhi_inferred ? { gurmukhi_inferred: true } : {}),
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

/**
 * --lang=pa: every Panjabi detail page (Panjabi meaning, grammar, etymology). About 3,300 entries
 * exist only in Panjabi, so this is the only way to their content. Default output entries-pa.jsonl.
 */
async function crawlPanjabi(panjabi: CatalogEntry[], ourWords: Set<string> | null) {
  const outPath = getArg("out") ?? "pipeline/sikhri/output/entries-pa.jsonl";
  const seen = new Set<string>();
  const all = panjabi.filter((e) => !seen.has(e.wn) && seen.add(e.wn) && (!ourWords || ourWords.has(e.term)));
  const done = loadCheckpoint(outPath);
  const limit = getArg("limit");
  const todo = all.filter((e) => !done.has(e.wn));
  const work = limit ? todo.slice(0, parseInt(limit, 10)) : todo;
  console.log(`\n${all.length} Panjabi entries; ${done.size} already scraped. Scraping ${work.length}...\n`);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const out = fs.createWriteStream(outPath, { flags: "a" });
  let found = 0;
  let errors = 0;
  const t0 = Date.now();
  for (let i = 0; i < work.length; i++) {
    const e = work[i];
    try {
      const url = panjabiEntryUrl(e);
      const parsed = parseEntry(await fetchText(`${url}&${MS_PARAMS}`));
      const hasContent = Boolean(parsed.meaning || parsed.grammar || parsed.etymology);
      out.write(JSON.stringify({
        lang: "pa", gurmukhi: e.term, wn: e.wn, wn_id: decodeWn(e.wn), found: hasContent,
        meaning: parsed.meaning, grammar: parsed.grammar, etymology: parsed.etymology, source_url: url,
      }) + "\n");
      if (hasContent) found++;
    } catch (err) {
      errors++;
      console.error(`\n  ${(err as Error).message} — will retry next run`);
    }
    const elapsed = (Date.now() - t0) / 1000;
    process.stdout.write(`\r[${elapsed.toFixed(0)}s] ${i + 1}/${work.length} | found:${found} errors:${errors}`);
    await sleep(DELAY_MS);
  }
  out.end();
  console.log(`\n\nDone. found:${found} errors:${errors} → ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
