/**
 * Etymology ingestion (P5).
 *
 * Reads Mahan Kosh definitions that already carry a cross_refs.origin_lang
 * marker (extracted by pipeline/mahan-kosh/scrape.py), turns each into an
 * etymology candidate (pipeline/etymology/parse.ts), and for Sanskrit
 * candidates with an extracted Devanagari root, looks the root up in the
 * Monier-Williams dictionary (Cologne C-SALT API) for a cited gloss.
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
import { extractEtymologyCandidate, type CrossRefs } from "./parse";
import { devanagariToIAST, devanagariToSLP1 } from "./transliterate";
import { fetchMwEntry, extractGlossFromTei } from "./monier-williams";

const PROVENANCE = "rule_derived";
const MW_DELAY_MS = 300; // polite delay between Monier-Williams API calls

interface DefRow {
  word_id: number;
  definition_text: string;
  cross_refs: CrossRefs;
}

async function fetchMarkedDefinitions(db: ReturnType<typeof supabaseAdmin>): Promise<DefRow[]> {
  const { data: dictSource } = await db.from("dict_sources").select("id").eq("code", "mahan_kosh").single();
  if (!dictSource) throw new Error("dict_source 'mahan_kosh' not found");

  const rows: DefRow[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db
      .from("definitions")
      .select("word_id, definition_text, cross_refs")
      .eq("dict_source_id", dictSource.id)
      .not("cross_refs->>origin_lang", "is", null)
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
  const mwCache = new Map<string, { gloss: string | null } | null>();

  for (const row of defRows) {
    const candidate = extractEtymologyCandidate(row.definition_text, row.cross_refs);
    if (!candidate) continue;

    let romanForm: string | null = null;
    let derivationNote: string | null = null;

    if (candidate.origin_language === "Sanskrit" && candidate.root_form) {
      romanForm = devanagariToIAST(candidate.root_form);
      const slp1 = devanagariToSLP1(candidate.root_form);

      let cached = mwCache.get(slp1);
      if (cached === undefined) {
        try {
          const entry = await fetchMwEntry(slp1);
          const gloss = entry ? extractGlossFromTei(entry.xml) : null;
          cached = { gloss };
        } catch (e) {
          console.error(`\nMW lookup failed for '${slp1}':`, (e as Error).message);
          cached = { gloss: null };
        }
        mwCache.set(slp1, cached);
        await sleep(MW_DELAY_MS);
      }
      if (cached?.gloss) {
        derivationNote = `Monier-Williams: ${cached.gloss}`;
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

  const allRows = Array.from(byWord.values()).flat();
  const wordIds = Array.from(byWord.keys());
  console.log(`Etymology rows to write: ${allRows.length} (${wordIds.length} words)`);

  // Idempotent replace: drop rule-derived rows for every word this pipeline is
  // authoritative over — i.e. every word with a marked Mahan Kosh definition,
  // NOT just the ones that currently produce an accepted candidate. Scoping
  // the delete to only-accepted words would leave stale rows behind forever
  // for any word whose only candidate a future parser change rejects (as just
  // happened tightening the Urdu marker below).
  const allMarkedWordIds = Array.from(new Set(defRows.map((r) => r.word_id)));
  for (let i = 0; i < allMarkedWordIds.length; i += 300) {
    const batch = allMarkedWordIds.slice(i, i + 300);
    const { error } = await db.from("etymology").delete().in("word_id", batch).eq("provenance", PROVENANCE);
    if (error) throw new Error(`etymology delete error: ${error.message}`);
  }

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
