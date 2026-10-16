// Vishraam (pause) marks (#217): where a line is read with a pause, as BaniDB
// publishes them. Each mark names a word by its index among the line's
// space-separated tokens, and a kind: "v" the main pause, "y" (yamki) the
// lighter one. BaniDB carries three sets that sometimes disagree, so all three
// are kept and the reader picks one; the viewer colours the last letter of
// each marked word, as iGurbani does.

export type VishraamKind = "v" | "y";
export type VishraamSet = "igurbani" | "sttm" | "sttm2";
/** A line's marks: per set, word index → kind. Stored in lines.vishraam. */
export type LineVishraam = Partial<Record<VishraamSet, Record<number, VishraamKind>>>;

export const VISHRAAM_SETS: { id: VishraamSet; label: string }[] = [
  { id: "igurbani", label: "iGurbani" },
  { id: "sttm", label: "SikhiToTheMax" },
  { id: "sttm2", label: "SikhiToTheMax 2" },
];
const SET_IDS = new Set<string>(VISHRAAM_SETS.map((s) => s.id));

/**
 * BaniDB's `visraam` field for one verse, as stored: unknown sets and kinds
 * and indexes outside the line's `words` tokens are dropped; null when
 * nothing is left.
 */
export function normalizeVishraam(raw: unknown, words: number): LineVishraam | null {
  if (!raw || typeof raw !== "object") return null;
  const out: LineVishraam = {};
  for (const [set, marks] of Object.entries(raw as Record<string, unknown>)) {
    if (!SET_IDS.has(set) || !Array.isArray(marks)) continue;
    const m: Record<number, VishraamKind> = {};
    for (const x of marks as { p?: unknown; t?: unknown }[]) {
      const p = Number(x?.p);
      if (!Number.isInteger(p) || p < 0 || p >= words) continue;
      if (x.t === "v" || x.t === "y") m[p] = x.t;
    }
    if (Object.keys(m).length) out[set as VishraamSet] = m;
  }
  return Object.keys(out).length ? out : null;
}

// Signs that belong to the letter before them: bindi, nukta, vowel signs,
// virama, tippi, addak, udaat, yakash.
const MARK = /[ਁ-ਃ਼ਾ-੍ੑੰੱੵ]/;
const VIRAMA = "੍";

/**
 * A word split before its last letter, the letter keeping its vowel signs and
 * any letter subjoined to it (ਨ੍ਹ), so colouring it never breaks a cluster.
 */
export function splitLastLetter(word: string): [string, string] {
  const chars = [...word];
  let i = chars.length;
  while (i > 0) {
    i--;
    if (MARK.test(chars[i])) continue;
    // A base letter: stop, unless it hangs from the letter before (virama).
    if (i > 0 && chars[i - 1] === VIRAMA) continue;
    break;
  }
  return [chars.slice(0, i).join(""), chars.slice(i).join("")];
}

/** Each set's mark on word `i` of a line, or null if none marks it. */
export function wordMarks(v: LineVishraam | null | undefined, i: number): Partial<Record<VishraamSet, VishraamKind>> | null {
  if (!v) return null;
  const out: Partial<Record<VishraamSet, VishraamKind>> = {};
  for (const { id } of VISHRAAM_SETS) {
    const k = v[id]?.[i];
    if (k) out[id] = k;
  }
  return Object.keys(out).length ? out : null;
}

/** The sets any of a passage's lines carry, in VISHRAAM_SETS order. */
export function vishraamSets(lines: (LineVishraam | null | undefined)[]): VishraamSet[] {
  return VISHRAAM_SETS.map((s) => s.id).filter((id) => lines.some((v) => v?.[id]));
}
