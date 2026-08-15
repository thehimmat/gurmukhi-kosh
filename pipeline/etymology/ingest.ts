/**
 * Etymology ingestion (P5).
 *
 * Reads Mahan Kosh definitions whose structured parse carries language
 * origins (definitions.parsed.language_origins, stamped by parse_shorthand.py
 * from the canonical printed-key markers), turns each origin into an
 * etymology candidate in print order (#48: chained markers like
 * ਫ਼ਾ. [سیب] … ਅੰ. Apple produce one row per origin, ordered by order_index),
 * and for Sanskrit candidates with a printed Devanagari root, looks the root
 * up in the Monier-Williams dictionary (Cologne C-SALT API) for a cited
 * gloss.
 *
 * Usage (from gurmukhi-kosh project root):
 *   npm run ingest:etymology
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Idempotent: delete+insert scoped to provenance='rule_derived' per touched word.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { supabaseAdmin } from "../shared/db";
import { sleep, progress } from "../shared/utils";
import { extractEtymologyCandidates, type ParsedOrigin } from "./parse";
import { devanagariToIAST, devanagariToSLP1 } from "./transliterate";
import { fetchMwEntry, extractGlossFromTei } from "./monier-williams";
import {
  fetchDsalHtml,
  extractDsalResults,
  selectDsalResult,
  headwordVariants,
  stripArabicDiacritics,
  type DsalDict,
  type DsalResult,
} from "./dsal";
import { gurmukhiToDisplayIPA } from "../../lib/pronounce/gurmukhi-to-ipa";
import { loadJsonlCache, appendJsonlCache } from "./cache";

const PROVENANCE = "rule_derived";
const MW_CACHE_FILE = "mw-cache.jsonl";
const DSAL_CACHE_FILE = "dsal-cache.jsonl";
const MW_DELAY_MS = 300; // polite delay between Monier-Williams API calls
const DSAL_DELAY_MS = 500; // gentler delay for DSAL's legacy CGI backend

// Both DSAL dictionaries are queried for every candidate and their homographs
// pooled (the right vocalization is often only in one of them: Steingass has
// only karm under کرم, Platts has karam). Order is the tie-break preference:
// Persian and Arabic lead with Steingass (its full title covers "the Arabic
// words and phrases to be met with in Persian literature"); Urdu leads with
// Platts. Mahan Kosh itself often can't cleanly separate Arabic-via-Persian
// from Arabic-via-Urdu, so this is a documented heuristic, not a certainty.
const DSAL_DICTS_BY_LANG: Record<string, DsalDict[]> = {
  Persian: ["steingass", "platts"],
  Arabic: ["steingass", "platts"],
  Urdu: ["platts", "steingass"],
};

const DSAL_LABEL: Record<DsalDict, string> = { steingass: "Steingass", platts: "Platts" };

interface DefRow {
  word_id: number;
  definition_text: string;
  parsed: { language_origins?: ParsedOrigin[] } | null;
  words: { gurmukhi: string } | null;
}

async function fetchMarkedDefinitions(db: ReturnType<typeof supabaseAdmin>): Promise<DefRow[]> {
  const { data: dictSource } = await db.from("dict_sources").select("id").eq("code", "mahan_kosh").single();
  if (!dictSource) throw new Error("dict_source 'mahan_kosh' not found");

  const rows: DefRow[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db
      .from("definitions")
      .select("word_id, definition_text, parsed, words(gurmukhi)")
      .eq("dict_source_id", dictSource.id)
      // Element 0 exists iff language_origins is a non-empty array — the
      // non-emptiness filter PostgREST can express.
      .not("parsed->language_origins->0", "is", null)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`fetchMarkedDefinitions: ${error.message}`);
    const batch = (data ?? []) as unknown as DefRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

async function main() {
  const db = supabaseAdmin();

  const defRows = await fetchMarkedDefinitions(db);
  console.log(`Mahan Kosh definitions with an origin marker: ${defRows.length}`);

  // Build one or more etymology rows per word, in source order (order_index).
  type EtyInsert = {
    word_id: number;
    order_index: number;
    origin_language: string;
    root_form: string | null;
    root_form_roman: string | null;
    derivation_note: string | null;
    source_text: string;
    provenance: string;
  };
  const byWord = new Map<number, EtyInsert[]>();

  // Cache Monier-Williams lookups per SLP1 headword so words sharing a root
  // (e.g. inflected forms of the same lemma) don't repeat the network call.
  // Seeded from the JSONL checkpoint (#47): only clean lookups are persisted,
  // so a key that failed last run is absent here and refetches.
  const mwCache = loadJsonlCache<{ gloss: string | null }>(MW_CACHE_FILE);

  // Same idea for DSAL (Steingass/Platts), keyed by diacritic-stripped root.
  // Caches ALL homographs both dictionaries returned across every spelling
  // variant: which one applies is decided per word (selectDsalResult against
  // the word's pronunciation), so two words citing the same spelling can
  // resolve to different readings.
  type PooledDsalResult = DsalResult & { dict: DsalDict };
  const dsalCache = loadJsonlCache<PooledDsalResult[]>(DSAL_CACHE_FILE);
  console.log(`Cache: ${mwCache.size} MW + ${dsalCache.size} DSAL lookups loaded from checkpoint`);

  for (const row of defRows) {
    const candidates = extractEtymologyCandidates(row.definition_text, row.parsed?.language_origins);

    for (const candidate of candidates) {
      let romanForm: string | null = null;
      let derivationNote: string | null = null;

      if (candidate.origin_language === "Sanskrit" && candidate.root_form && candidate.root_script === "devanagari") {
        romanForm = devanagariToIAST(candidate.root_form);
        const slp1 = devanagariToSLP1(candidate.root_form);

        let cached = mwCache.get(slp1);
        if (cached === undefined) {
          try {
            const entry = await fetchMwEntry(slp1);
            const gloss = entry ? extractGlossFromTei(entry.xml) : null;
            cached = { gloss };
            appendJsonlCache(MW_CACHE_FILE, slp1, cached);
          } catch (e) {
            console.error(`\nMW lookup failed for '${slp1}':`, (e as Error).message);
            // In-memory only: not retried this run, refetched next run.
            cached = { gloss: null };
          }
          mwCache.set(slp1, cached);
          await sleep(MW_DELAY_MS);
        }
        if (cached?.gloss) {
          derivationNote = `Monier-Williams: ${cached.gloss}`;
        }
      } else if (candidate.root_form && candidate.root_script === "perso_arabic" && DSAL_DICTS_BY_LANG[candidate.origin_language]) {
        const cacheKey = stripArabicDiacritics(candidate.root_form).trim();

        let cached = dsalCache.get(cacheKey);
        if (cached === undefined) {
          cached = [];
          let failed = false;
          try {
            // Query every dictionary under every codepoint-normalized spelling
            // and pool the homographs. The returned headword must equal the
            // queried spelling — a cheap round-trip check against the CGI
            // search matching something unrelated.
            for (const dict of DSAL_DICTS_BY_LANG[candidate.origin_language]) {
              for (const variant of headwordVariants(candidate.root_form)) {
                const html = await fetchDsalHtml(dict, variant);
                await sleep(DSAL_DELAY_MS);
                for (const r of extractDsalResults(html, dict)) {
                  if (r.headword !== variant || !r.gloss) continue;
                  if (cached.some((c) => c.dict === dict && c.roman === r.roman && c.gloss === r.gloss)) continue;
                  cached.push({ ...r, dict });
                }
              }
            }
          } catch (e) {
            // A partial pool must not be persisted — a homograph the failed
            // request would have returned could win selectDsalResult.
            failed = true;
            console.error(`\nDSAL lookup failed for '${cacheKey}':`, (e as Error).message);
          }
          dsalCache.set(cacheKey, cached);
          if (!failed) appendJsonlCache(DSAL_CACHE_FILE, cacheKey, cached);
        }

        if (cached.length > 0 && row.words?.gurmukhi) {
          const selected = selectDsalResult(cached, gurmukhiToDisplayIPA(row.words.gurmukhi));
          if (selected?.gloss) {
            derivationNote = `${DSAL_LABEL[selected.dict]}: ${selected.gloss}`;
            // The dictionary's own transliteration — a cited romanization,
            // unlike the computed Devanagari→IAST used for Sanskrit roots.
            romanForm = selected.roman;
          }
        }
      }

      const list = byWord.get(row.word_id) ?? [];
      list.push({
        word_id: row.word_id,
        order_index: list.length + 1,
        origin_language: candidate.origin_language,
        root_form: candidate.root_form,
        root_form_roman: romanForm,
        derivation_note: derivationNote,
        source_text: candidate.source_text,
        provenance: PROVENANCE,
      });
      byWord.set(row.word_id, list);
    }
  }

  const wordIds = Array.from(byWord.keys());

  // UNIQUE(word_id, order_index) spans provenances: imported rows (e.g.
  // Shackle, since 2026-07-22) already occupy the low order_index slots for
  // many of these words, so rule-derived rows must number ABOVE each word's
  // surviving rows (the same renumber-above convention the /admin/spellings
  // merge uses). Numbering from 1 collides on the first shared word.
  const survivorMax = new Map<number, number>();
  for (let i = 0; i < wordIds.length; i += 100) {
    const batch = wordIds.slice(i, i + 100);
    const { data, error } = await db
      .from("etymology")
      .select("word_id, order_index")
      .in("word_id", batch)
      .neq("provenance", PROVENANCE);
    if (error) throw new Error(`survivor order_index fetch: ${error.message}`);
    for (const r of data ?? []) {
      survivorMax.set(r.word_id, Math.max(survivorMax.get(r.word_id) ?? 0, r.order_index));
    }
  }
  for (const [wordId, list] of byWord) {
    const base = survivorMax.get(wordId) ?? 0;
    list.forEach((row, i) => {
      row.order_index = base + i + 1;
    });
  }

  const allRows = Array.from(byWord.values()).flat();
  console.log(`Etymology rows to write: ${allRows.length} (${wordIds.length} words)`);

  // Idempotent replace: this pipeline is the sole writer of
  // provenance='rule_derived' (verified: 'imported' rows belong to cited
  // sources like Shackle), so the delete scope is the whole provenance.
  // Scoping to currently-marked words is not enough: when a marker is
  // retired (the false ਉ./ਪੰ./ਦੇਸ਼. origins, #35), the affected words drop
  // out of the marked set entirely and word-scoped deletes would leave
  // their stale rows behind forever.
  const { error: delError } = await db.from("etymology").delete().eq("provenance", PROVENANCE);
  if (delError) throw new Error(`etymology delete error: ${delError.message}`);

  let done = 0;
  const t0 = Date.now();
  for (let i = 0; i < allRows.length; i += 100) {
    const batch = allRows.slice(i, i + 100);
    const { error } = await db.from("etymology").insert(batch);
    if (error) throw new Error(`etymology insert error: ${error.message}`);
    done += batch.length;
    progress(done, allRows.length, t0, "Etymology ");
  }
  console.log(`\n\nDone. etymology: ${done} rows / ${wordIds.length} words.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
