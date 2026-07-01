// DSAL dictionary lookups (P5 phase 2): Steingass's Comprehensive
// Persian-English Dictionary (1892, includes Arabic loanwords) and Platts's
// Dictionary of Urdu, Classical Hindi, and English (1884), both served by the
// Digital Dictionaries of South Asia at dsal.uchicago.edu. Unlike Cologne's
// C-SALT API there is no JSON endpoint — the CGI search form returns HTML
// (GET /cgi-bin/app/{dict}_query.py?qs=…&searchhws=yes&matchtype=exact), so
// entry extraction is a pure HTML parser kept separate from the network call,
// mirroring monier-williams.ts.
//
// Licensing (resolved 2026-07-01, .projects/etymology-phase2-plan.md §0): the
// underlying works are public domain; DSAL's pages claim CC BY-NC-ND 2.0 on
// the digitization. Decision was proceed-and-notify — attributed,
// rate-limited, per-headword lookups only (never a bulk download), a
// notification email to DSAL, and glosses removable on request (the etymology
// pipeline is idempotent, so dropping this lookup and re-running erases them).

export type DsalDict = "steingass" | "platts";

export interface DsalResult {
  headword: string; // Perso-Arabic headword exactly as returned
  roman: string | null; // the dictionary's own transliteration (e.g. "ḥukm")
  gloss: string | null;
}

// Perso-Arabic combining marks (fathatan…sukun, superscript alef) and tatweel.
// Mahan Kosh's quotes are often vocalized (حُکم); DSAL headwords are not.
const AR_DIACRITICS = /[\u0640\u064B-\u065F\u0670]/g;

export function stripArabicDiacritics(s: string): string {
  return s.replace(AR_DIACRITICS, "");
}

// Each DSAL digitization is internally inconsistent about Arabic vs. Farsi
// codepoints for the same letter — Steingass stores حكم under Arabic kāf
// (U+0643) but كلام only under Farsi kāf (U+06A9), and Platts is the reverse
// for حکم — so an exact-match lookup must try both spelling conventions.
// Urdu-specific letters (ہ U+06C1, ے U+06D2) also normalize: Steingass has
// ناهی where Mahan Kosh quotes ناہی.
const TO_PERSIAN: Record<string, string> = {
  "ك": "ک", // ك → ک
  "ي": "ی", // ي → ی
  "ہ": "ه", // ہ → ه
  "ے": "ی", // ے → ی
};
const TO_ARABIC: Record<string, string> = {
  "ک": "ك", // ک → ك
  "ی": "ي", // ی → ي
  "ہ": "ه", // ہ → ه
  "ے": "ي", // ے → ي
};

function mapChars(s: string, table: Record<string, string>): string {
  return Array.from(s, (ch) => table[ch] ?? ch).join("");
}

/**
 * Candidate spellings to try against a DSAL exact-match search, in order:
 * the diacritic-stripped original, its Persian-codepoint normalization, and
 * its Arabic-codepoint normalization (deduplicated).
 */
export function headwordVariants(rootForm: string): string[] {
  const stripped = stripArabicDiacritics(rootForm).trim();
  return Array.from(new Set([stripped, mapChars(stripped, TO_PERSIAN), mapChars(stripped, TO_ARABIC)]));
}

const DSAL_BASE = "https://dsal.uchicago.edu/cgi-bin/app";

/** Fetches the raw HTML for one exact-match headword search. */
export async function fetchDsalHtml(dict: DsalDict, headword: string): Promise<string> {
  const params = new URLSearchParams({ qs: headword, searchhws: "yes", matchtype: "exact" });
  const res = await fetch(`${DSAL_BASE}/${dict}_query.py?${params.toString()}`);
  if (!res.ok) throw new Error(`DSAL ${dict} error ${res.status} for '${headword}'`);
  return res.text();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

/**
 * Extracts the first dictionary entry from a DSAL result page: the returned
 * headword, the dictionary's own roman transliteration, and the entry gloss.
 *
 * The gloss is the entry's core definition verbatim, scoped to exclude the
 * compound-phrase listings that dominate longer entries: Platts introduces
 * its compounds with ": —" (its "; —" is a sense separator inside the main
 * gloss and is kept); Steingass wraps compounds in a [ … ] block, with
 * differently-vocalized sub-lemmas ("— ḥakam, …") following it, so both are
 * dropped. This is scoping of quoted text, never paraphrase.
 *
 * Exact match can return several homographs (Platts حکم → ḥukm/ḥakam/ḥikam);
 * only the first is taken, consistent with the MW lookup's size=1.
 */
export function extractDsalResults(html: string, dict: DsalDict): DsalResult[] {
  if (html.includes("No results for search term")) return [];

  const results: DsalResult[] = [];
  const blockRe = /<div class='hw_result'>([\s\S]*?)<\/div>/g;
  for (let block = blockRe.exec(html); block; block = blockRe.exec(html)) {
    const head = block[1].match(/\d+\)\s*<a [^>]*>([^<]+)<\/a>[ \t]*([^\n<(]*)/);
    if (!head) continue;
    const headword = head[1].trim();
    const roman = head[2].trim() || null;

    const bq = block[1].match(/<blockquote>([\s\S]*?)<\/blockquote>/);
    if (!bq) {
      results.push({ headword, roman, gloss: null });
      continue;
    }

    let raw = bq[1];
    if (dict === "steingass") {
      raw = raw.replace(/\[[\s\S]*?\]/g, "");
    }

    let text = decodeEntities(
      raw
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    );

    if (dict === "platts") {
      const cut = text.indexOf(": —");
      if (cut !== -1) text = text.slice(0, cut);
    } else {
      const cut = text.indexOf("; —");
      if (cut !== -1) text = text.slice(0, cut);
    }

    const gloss =
      text
        .replace(/\s+([.,;:)])/g, "$1")
        .replace(/([(])\s+/g, "$1")
        .replace(/[;:,\s]+$/, "")
        .trim() || null;

    results.push({ headword, roman, gloss });
  }
  return results;
}

/** First entry only — see selectDsalResult for vocalization-aware selection. */
export function extractDsalResult(html: string, dict: DsalDict): DsalResult | null {
  return extractDsalResults(html, dict)[0] ?? null;
}

// ── Homograph selection ─────────────────────────────────────────────────────
// One Perso-Arabic spelling covers several vocalizations (Platts حکم → ḥukm /
// ḥakam / ḥikam; Steingass شيخ → shīḵẖ "the sea-shore" / shaiḵẖ "an elder"),
// and taking the first entry is often wrong. The Gurmukhi word's own vowels
// say which reading Mahan Kosh meant, so both the dictionary's romanization
// and the word's IPA (lib/pronounce) are folded to a crude shared skeleton and
// compared by edit distance. This is a labeled heuristic — etymology rows are
// provenance='rule_derived', never presented as scholar-verified.

const IPA_FOLD: Record<string, string> = {
  "ə": "a",
  "ɾ": "r",
  "ɦ": "h",
  "ʊ": "u",
  "ɪ": "i",
  "ʰ": "h",
  "ʱ": "h",
  "ŋ": "n",
  "ɲ": "n",
  "ʃ": "sh",
  "ː": "",
};

/**
 * Folds a dictionary romanization (shaiḵẖ) or a Gurmukhi IPA string (seːkʰ)
 * into a shared lowercase a-z skeleton ("sex") for edit-distance comparison.
 */
export function foldForMatch(s: string): string {
  let t = s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  t = Array.from(t, (ch) => IPA_FOLD[ch] ?? ch).join("");
  // Drop ayn/hamza and any other non-letters BEFORE digraph folding, so marks
  // inside a vowel cluster (sāʻī) don't block it.
  t = t.replace(/[^a-z]/g, "");
  return t.replace(/tsh/g, "c").replace(/sh/g, "s").replace(/kh/g, "x").replace(/ai/g, "e").replace(/au/g, "o");
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const tmp = dp[i];
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[a.length];
}

/**
 * Picks the homograph whose romanization is closest to the Gurmukhi word's
 * pronunciation (`target` is an IPA string from gurmukhiToDisplayIPA, or any
 * romanization). Ties keep the earlier (dictionary-order) entry; results
 * without a romanization only win if nothing else is comparable.
 */
export function selectDsalResult<T extends DsalResult>(results: T[], target: string): T | null {
  if (results.length === 0) return null;
  const folded = foldForMatch(target);

  let best: T | null = null;
  let bestDist = Infinity;
  for (const r of results) {
    if (!r.roman) continue;
    // A roman field can carry several vocalizations ("shag̠ẖl, shug̠ẖl") —
    // score by the closest one.
    const dist = Math.min(...r.roman.split(",").map((part) => levenshtein(foldForMatch(part), folded)));
    if (dist < bestDist) {
      best = r;
      bestDist = dist;
    }
  }
  return best ?? results[0];
}
