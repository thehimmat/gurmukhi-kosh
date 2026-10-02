// Shabad-level metadata from BaniDB verses (#86).
//
// BaniDB reports writer per VERSE. The ingest used to take whichever verse of a
// shabad it met first and never look again, so a shabad whose first verse
// carried no writer stayed null even when later verses named one. These helpers
// pick the first verse that actually names a writer, and build upsert rows that
// leave a known writer alone when a verse has none.

import type { BaniDBVerse } from "../../lib/banidb";

export type ShabadWriter = { writerId: number; english: string };

function writerOf(v: BaniDBVerse): ShabadWriter | null {
  const w = v.writer;
  const english = w?.english?.trim();
  if (!w || !w.writerId || !english) return null;
  return { writerId: w.writerId, english: w.english };
}

/** shabadId -> the first writer any of its verses names. Shabads with none are absent. */
export function shabadWriters(verses: readonly BaniDBVerse[]): Map<number, ShabadWriter> {
  const out = new Map<number, ShabadWriter>();
  for (const v of verses) {
    if (out.has(v.shabadId)) continue;
    const w = writerOf(v);
    if (w) out.set(v.shabadId, w);
  }
  return out;
}

/**
 * Row for upserting a shabad from one verse. Writer and raag columns are
 * included only when the verse carries them: PostgREST's upsert updates just the columns it
 * is sent, so omitting them keeps a value another verse (or an earlier run) supplied.
 */
export function shabadUpsertRow(v: BaniDBVerse) {
  const row: {
    id: number;
    ang_start: number;
    raag_english?: string | null;
    raag_gurmukhi?: string | null;
    writer_english?: string;
    writer_id?: number;
  } = { id: v.shabadId, ang_start: v.pageNo };
  if (v.raag?.english || v.raag?.unicode) {
    row.raag_english = v.raag.english ?? null;
    row.raag_gurmukhi = v.raag.unicode ?? null;
  }
  const w = writerOf(v);
  if (w) {
    row.writer_english = w.english;
    row.writer_id = w.writerId;
  }
  return row;
}
