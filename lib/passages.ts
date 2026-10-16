// Passages (#220): the units a bani is read in, from BaniDB's banis. Each
// bani verse carries a `paragraph` number (Japji: Mul Mantar, ॥ਜਪੁ॥, the
// salok, each pauri, the closing salok), but its own verse ids, not the ang
// endpoint's ones our lines carry, so verses are matched to our lines by page
// and text, in reading order. A paragraph becomes one passage per contiguous
// run of our lines; the viewer opens a line in the smallest one holding it.

export type BaniVerse = { paragraph: number; page: number; text: string };
export type CorpusLine = { id: number; verse_id: number; source_fk: number; ang: number; gurmukhi: string };
export type PassageRun = {
  ordinal: number; // the paragraph's place in the bani, from 1
  part: number;    // from 1; >1 only where the bani skips lines mid-paragraph
  source_fk: number;
  first: CorpusLine;
  last: CorpusLine;
};

export function normalizeText(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

/**
 * A bani's verses matched to our lines. `onPage(page)` gives the candidate
 * lines on a page, across scriptures (a bani like Rehras crosses into Dasam
 * Granth), in reading order.
 */
export function alignBani(
  verses: BaniVerse[],
  onPage: (page: number) => CorpusLine[],
): { runs: PassageRun[]; unmatched: BaniVerse[] } {
  const runs: PassageRun[] = [];
  const unmatched: BaniVerse[] = [];
  const ordinals = new Map<number, number>();
  const parts = new Map<number, number>();
  let prev: CorpusLine | null = null;

  for (const verse of verses) {
    const text = normalizeText(verse.text);
    const hits = onPage(verse.page).filter((l) => normalizeText(l.gurmukhi) === text);
    // Of equal lines (a refrain), the first after the last match, in the
    // same scripture if it has one.
    const after = (l: CorpusLine) => !prev || l.source_fk !== prev.source_fk || l.verse_id > prev.verse_id;
    const hit =
      hits.find((l) => prev && l.source_fk === prev.source_fk && l.verse_id > prev.verse_id) ??
      hits.find(after) ??
      hits[0];
    if (!hit) { unmatched.push(verse); continue; }

    if (!ordinals.has(verse.paragraph)) ordinals.set(verse.paragraph, ordinals.size + 1);
    const ordinal = ordinals.get(verse.paragraph)!;
    const run = runs.at(-1);
    const extends_ = run && run.ordinal === ordinal && run.source_fk === hit.source_fk && hit.verse_id === run.last.verse_id + 1;
    if (extends_) run.last = hit;
    else {
      const part = (parts.get(ordinal) ?? 0) + 1;
      parts.set(ordinal, part);
      runs.push({ ordinal, part, source_fk: hit.source_fk, first: hit, last: hit });
    }
    prev = hit;
  }
  return { runs, unmatched };
}

type Span = { first_verse_id: number; last_verse_id: number; bani_id: number };

/** The passage a line opens in: the smallest holding it, then the lowest bani id. */
export function pickPassage<P extends Span>(candidates: P[]): P | null {
  const size = (p: Span) => p.last_verse_id - p.first_verse_id;
  return [...candidates].sort((a, b) => size(a) - size(b) || a.bani_id - b.bani_id)[0] ?? null;
}

/**
 * Whether a passage is a smaller unit than the line's shabad, so the viewer
 * opens the passage: inside the shabad and not all of it (Japji's first
 * shabad holds four passages). A passage the same as its shabad, or running
 * past it, leaves the shabad. A line with no shabad takes the passage.
 */
export function narrowerThanShabad(
  p: { first_verse_id: number; last_verse_id: number },
  shabad: { verse_id: number }[],
): boolean {
  if (!shabad.length) return true;
  const first = shabad[0].verse_id;
  const last = shabad.at(-1)!.verse_id;
  const inside = p.first_verse_id >= first && p.last_verse_id <= last;
  return inside && (p.first_verse_id > first || p.last_verse_id < last);
}
