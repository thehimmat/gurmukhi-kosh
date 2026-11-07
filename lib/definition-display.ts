// Presentation rules for a definitions row on the word page.

import { parseMkPointer, type MkPointer } from "./padarth/mk-pointer";

/**
 * The English line to print under a definition, or null when it would only
 * repeat the definition text. Shackle stores its English in both columns
 * (#122); a source whose text is Punjabi (Mahan Kosh) would carry a distinct
 * English gloss here once one exists (#34).
 */
export function secondaryGloss(def: {
  definition_text: string;
  definition_en: string | null;
}): string | null {
  const en = def.definition_en?.trim();
  if (!en || en === def.definition_text.trim()) return null;
  return def.definition_en;
}

/**
 * The ↗ link beside a definition source: only sources with a page per entry.
 * A whole-book link (Shackle's publisher page) is credited on /about instead.
 */
export function entryLink(sourceCode: string, word: string): string | null {
  if (sourceCode === "mahan_kosh") {
    return `https://www.searchgurbani.com/sggs-kosh/view?Word=${encodeURIComponent(word)}`;
  }
  return null;
}

/**
 * Mahan Kosh rows that are only a pointer ("ਦੇਖੋ, ਮੰਞੁ.", lib/padarth/mk-pointer.ts) are not senses:
 * the public page lists their targets as one "ਦੇਖੋ" line instead of a card each (#23). Rows with
 * any words of Mahan Kosh's own stay senses. Other sources pass through.
 */
export function splitPointerRows<T extends { definition_text: string }>(sourceCode: string, defs: T[]): { senses: T[]; pointers: MkPointer[] } {
  if (sourceCode !== "mahan_kosh") return { senses: defs, pointers: [] };
  const senses: T[] = [];
  const pointers: MkPointer[] = [];
  for (const d of defs) {
    const found = parseMkPointer(d.definition_text);
    if (!found) {
      senses.push(d);
      continue;
    }
    for (const p of found) if (!pointers.some((q) => q.target === p.target && q.sense === p.sense)) pointers.push(p);
  }
  return { senses, pointers };
}
