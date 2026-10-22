// Which SikhRI entries to fetch (#40). Pure: the glossary catalogs in, the crawl list out.
//
// The Panjabi glossary lists (gurmukhi, wn) per homograph; the English glossary lists
// (romanization, wn). A detail page is fetched by romanization + wn, so an entry needs an English
// listing to be fetchable. Since 2026-10-21 the crawl takes every entry (full contents, curator-only
// until SikhRI gives guidance); passing a word list restores the old filter to known Kosh words.

import type { CatalogEntry } from "./parse";

export interface CrawlEntry {
  wn: string;
  gurmukhi: string | null; // null when the entry is listed only in the English glossary
  roman: string;
  // Not in the Panjabi glossary, but every listed homograph with the same romanization has this
  // Gurmukhi. An inference, so it is marked (#137) and stays curator-only with the rest.
  gurmukhi_inferred?: true;
}

export interface CrawlPlan {
  entries: CrawlEntry[];
  unfetchable: Array<{ wn: string; gurmukhi: string }>; // Panjabi-only: no romanization to fetch by
}

export function planCrawl(
  panjabi: Pick<CatalogEntry, "term" | "wn">[],
  english: Pick<CatalogEntry, "term" | "wn">[],
  ourWords: Set<string> | null,
): CrawlPlan {
  const gurmukhiByWn = new Map<string, string>();
  for (const e of panjabi) {
    if (ourWords && !ourWords.has(e.term)) continue;
    if (!gurmukhiByWn.has(e.wn)) gurmukhiByWn.set(e.wn, e.term);
  }

  const romanByWn = new Map<string, string>();
  for (const e of english) if (!romanByWn.has(e.wn)) romanByWn.set(e.wn, e.term);

  const entries: CrawlEntry[] = [];
  const unfetchable: CrawlPlan["unfetchable"] = [];
  for (const [wn, gurmukhi] of gurmukhiByWn) {
    const roman = romanByWn.get(wn);
    if (roman) entries.push({ wn, gurmukhi, roman });
    else unfetchable.push({ wn, gurmukhi });
  }
  if (!ourWords) {
    // Gurmukhi spellings seen per romanization, from the entries the Panjabi glossary does list.
    const spellingsByRoman = new Map<string, Set<string>>();
    for (const e of entries) {
      if (!e.gurmukhi) continue;
      (spellingsByRoman.get(e.roman) ?? spellingsByRoman.set(e.roman, new Set()).get(e.roman)!).add(e.gurmukhi);
    }
    for (const [wn, roman] of romanByWn) {
      if (gurmukhiByWn.has(wn)) continue;
      const spellings = spellingsByRoman.get(roman);
      if (spellings?.size === 1) entries.push({ wn, gurmukhi: [...spellings][0], roman, gurmukhi_inferred: true });
      else entries.push({ wn, gurmukhi: null, roman });
    }
  }
  return { entries, unfetchable };
}

/**
 * Lines crawled before the plan could name their Gurmukhi (an unlisted glossary letter, a
 * homograph) get it filled in from the current plan. Everything else on the line is kept.
 */
export function refreshGurmukhi<T extends { wn: string; gurmukhi: string | null }>(
  lines: T[],
  plan: CrawlPlan,
): { lines: T[]; updated: number } {
  const byWn = new Map(plan.entries.filter((e) => e.gurmukhi).map((e) => [e.wn, e]));
  let updated = 0;
  const out = lines.map((l) => {
    const e = byWn.get(l.wn);
    if (l.gurmukhi || !e) return l;
    updated++;
    return { ...l, gurmukhi: e.gurmukhi, ...(e.gurmukhi_inferred ? { gurmukhi_inferred: true } : {}) };
  });
  return { lines: out, updated };
}

const BASE = "https://gurugranthsahibdictionary.io";

/** A Panjabi detail page, fetched by its Gurmukhi headword and wn (no romanization needed). */
export function panjabiEntryUrl(e: Pick<CatalogEntry, "term" | "wn">): string {
  return `${BASE}/dictionary/panjabi/ms/${encodeURIComponent(e.term)}?wn=${encodeURIComponent(e.wn)}`;
}
