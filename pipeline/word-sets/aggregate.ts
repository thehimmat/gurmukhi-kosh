/**
 * Pure helpers for building word sets. No DB/network imports so these stay
 * trivially unit-testable (see tests/word-sets.test.ts).
 */

import type { BaniDBBani } from "../../lib/banidb";

/** Pull the BaniDB verse ids out of a bani response (they match lines.verse_id). */
export function extractVerseIds(bani: BaniDBBani): number[] {
  return (bani.verses ?? [])
    .map((v) => v?.verse?.verseId)
    .filter((id): id is number => typeof id === "number");
}

/** Count occurrences per word_id from a flat list of occurrence rows. */
export function aggregateWordCounts(rows: { word_id: number }[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const r of rows) counts.set(r.word_id, (counts.get(r.word_id) ?? 0) + 1);
  return counts;
}

/** Split an array into chunks of at most `size` (keeps DB `.in()` queries bounded). */
export function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk size must be > 0");
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
