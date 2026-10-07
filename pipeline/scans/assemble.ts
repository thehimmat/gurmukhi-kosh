// Assemble a canonical text from a base edition plus manuscript verdicts.
//
// The base edition (for Sarbloh, the typed Budha Dal text) supplies words and word
// division. Where a manuscript reading was checked against a disputed half-line,
// the manuscript decides: if it supports the base, the base stands; if it supports
// the other edition or reads differently, the manuscript's own reading becomes
// canonical, re-divided into words after the edition it most resembles. Every
// checked half-line is kept as a witness variant (manuscript, base, other edition).
//
// v0 keeps the base's orthography wherever the base is upheld.

import type { Pada } from "./collate";

export type Supports = "BD" | "CE" | "both" | "neither" | "absent" | "heading" | "unreadable";

export interface Verdict {
  pada: number;
  bd: string;
  ce: string | null;
  /** Manuscript reading as transcribed, larivaar. */
  ms: string;
  supports: Supports;
  confidence: "high" | "medium" | "low";
  page: number | null;
  note?: string;
}

export interface CanonicalPada extends Pada {
  absentInMs?: true;
}

export interface WitnessVariant {
  pada: number;
  canonical: string;
  readings: { ms1878: string; budhaDal: string; criticalEdition: string | null };
  supports: Supports;
  confidence: Verdict["confidence"];
  page: number | null;
  needsReview: boolean;
  note?: string;
}

const chars = (s: string) => [...s.normalize("NFC")];

/**
 * Put spaces into a larivaar reading where the reference half-line divides its words.
 * Letters always come from the larivaar reading; only the word breaks come from the reference.
 */
export function segmentLike(larivaar: string, reference: string): string {
  const a = chars(larivaar.replace(/\s+/g, ""));
  const refWords = reference.trim().split(/\s+/).filter(Boolean);
  const b: string[] = [];
  const boundary: boolean[] = [];
  for (const w of refWords) chars(w).forEach((c, k) => (b.push(c), boundary.push(k === 0 && b.length > 1)));
  if (!a.length || !b.length) return larivaar;

  const n = a.length;
  const m = b.length;
  const D = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++) D[i][j] = Math.min(D[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1), D[i - 1][j] + 1, D[i][j - 1] + 1);
  const matches = n + m - D[n][m] * 2; // rough count of shared letters
  if (matches / Math.max(n, m) < 0.5) return larivaar;

  // Trace back to pair each larivaar letter with a reference position (or none).
  const ops: Array<{ ch: string; ref: number | null } | { ch: null; ref: number }> = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) ops.push({ ch: a[--i], ref: --j });
    else if (i > 0 && D[i][j] === D[i - 1][j] + 1) ops.push({ ch: a[--i], ref: null });
    else ops.push({ ch: null, ref: --j });
  }
  ops.reverse();

  let out = "";
  let pendingBreak = false;
  for (const op of ops) {
    if (op.ref !== null && boundary[op.ref]) pendingBreak = true;
    if (op.ch === null) continue; // reference-only letter: carry its break to the next letter
    if (pendingBreak && op.ref !== null && out) out += " ";
    if (op.ref !== null) pendingBreak = false;
    out += op.ch;
  }
  return out;
}

const TAKE_MS: Supports[] = ["CE", "neither"];
const REVIEW: Supports[] = ["neither", "absent", "unreadable"];

/** Apply manuscript verdicts to a base edition. */
export function assemble(base: Pada[], verdicts: Verdict[]): { text: CanonicalPada[]; variants: WitnessVariant[] } {
  const byPada = new Map(verdicts.map((v) => [v.pada, v]));
  const text: CanonicalPada[] = [];
  const variants: WitnessVariant[] = [];
  base.forEach((p, i) => {
    const v = byPada.get(i);
    if (!v) return void text.push({ ...p });
    const takeMs = TAKE_MS.includes(v.supports) && v.ms.trim() !== "";
    const canonical = takeMs ? segmentLike(v.ms, v.supports === "CE" && v.ce ? v.ce : p.text) : p.text;
    text.push(v.supports === "absent" ? { ...p, absentInMs: true } : { text: canonical, ref: p.ref });
    variants.push({
      pada: i,
      canonical,
      readings: { ms1878: v.ms, budhaDal: v.bd, criticalEdition: v.ce },
      supports: v.supports,
      confidence: v.confidence,
      page: v.page,
      needsReview: v.confidence === "low" || REVIEW.includes(v.supports) || /[।॥]/.test(canonical),
      ...(v.note ? { note: v.note } : {}),
    });
  });
  return { text, variants };
}

export interface SlipFix {
  pada: number;
  from: string;
  to: string;
}

/**
 * Correct typing slips found by triangulation (see triangulate.ts) in an assembled text.
 * Half-lines the manuscript already ruled on are left alone: its reading wins.
 */
export function applySlips(
  text: CanonicalPada[],
  slips: Array<{ pada: number; text: string; words: Array<{ typed: string; print: string; kind: string }> }>,
  ruled: Set<number>,
): { text: CanonicalPada[]; fixes: SlipFix[] } {
  const out = text.map((p) => ({ ...p }));
  const fixes: SlipFix[] = [];
  for (const s of slips) {
    if (ruled.has(s.pada) || !out[s.pada]) continue;
    out[s.pada].text = s.text;
    for (const w of s.words) if (w.kind === "typing-slip") fixes.push({ pada: s.pada, from: w.typed, to: w.print });
  }
  return { text: out, fixes };
}
