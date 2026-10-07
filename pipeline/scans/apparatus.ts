// Variant apparatus for a canonical text: where the other witnesses differ from it.
//
// The canonical text (for Sarbloh, the Budha Dal print) is never changed here. Each entry records
// the other witnesses' readings for one half-line and, where the difference matters, a note saying
// what the other sources have. "Significant" means the canonical reading is not what the
// manuscript has (the manuscript sides with the critical edition, has its own reading, or lacks
// the half-line), or a person or a research pass wrote a note about it.

import type { Pada } from "./collate";
import type { Verdict } from "./assemble";

export type ApparatusKind =
  | "ms-agrees-with-ce" // the 1878 bir and the critical edition agree against the canon
  | "ms-own-reading" // the 1878 bir reads differently from both editions
  | "not-in-ms" // the canonical half-line is not in the 1878 bir
  | "ce-differs" // the critical edition differs; the 1878 bir agrees with the canon, or was not checked
  | "ce-ocr" // the difference was OCR noise in the critical edition
  | "not-in-ce" // no matching line was found in the critical edition (not checked; may be OCR)
  | "heading"; // a heading or label, not text

export interface ApparatusEntry {
  pada: number;
  ref: string | null;
  canonical: string;
  readings: { ms1878?: string; criticalEdition?: string | null };
  kind: ApparatusKind;
  /** Whether a manuscript reading was checked for this half-line. */
  checked: boolean;
  significant: boolean;
  note?: string;
}

export type ResearchNote = string | { note: string; kind?: ApparatusKind; readings?: ApparatusEntry["readings"] };

export interface ApparatusInput {
  base: Pada[];
  /** Canon-vs-critical-edition collation rows (see collate-cli `collate`). */
  collation: Array<{ base: number; otherText: string | null; band: string }>;
  /** Manuscript checks, one per half-line. */
  verdicts: Verdict[];
  /**
   * Notes from a research pass, by half-line; they replace the automatic note. A research pass can
   * also correct the kind and the readings, e.g. where the automatic check looked at the wrong line.
   */
  research?: Record<number, ResearchNote>;
  /** Reviewers' notes, by half-line; appended. */
  reviewNotes?: Record<number, string>;
}

const q = (s: string) => `«${s}»`;

function fromVerdict(v: Verdict): Pick<ApparatusEntry, "kind" | "significant" | "note"> {
  const ce = v.ce ? `the critical edition ${q(v.ce)}` : "the critical edition does not have it";
  switch (v.supports) {
    case "CE":
      return { kind: "ms-agrees-with-ce", significant: true, note: `The manuscripts differ from Budha Dal: the 1878 bir reads ${q(v.ms)}, ${ce}.` };
    case "neither":
      return { kind: "ms-own-reading", significant: true, note: `The 1878 bir has its own reading, ${q(v.ms)}; ${ce}.` };
    case "absent":
      return {
        kind: "not-in-ms",
        significant: true,
        note: `Not in the 1878 bir. ${v.ce ? `The critical edition reads ${q(v.ce)}.` : "Not in the critical edition either."}`,
      };
    case "BD":
      return { kind: "ce-differs", significant: false, note: v.ce ? `The critical edition reads ${q(v.ce)}; the 1878 bir agrees with Budha Dal.` : undefined };
    case "heading":
      return { kind: "heading", significant: false };
    case "both":
      return { kind: "ce-ocr", significant: false };
    default: // unreadable
      return { kind: "ce-differs", significant: false, note: "The 1878 bir is unreadable here." };
  }
}

export function buildApparatus({ base, collation, verdicts, research = {}, reviewNotes = {} }: ApparatusInput): ApparatusEntry[] {
  const byPada = new Map(verdicts.map((v) => [v.pada, v]));
  const rows = new Map(collation.map((r) => [r.base, r]));
  const out: ApparatusEntry[] = [];
  base.forEach((p, i) => {
    const v = byPada.get(i);
    const row = rows.get(i);
    let entry: ApparatusEntry | null = null;
    if (v) {
      const r = fromVerdict(v);
      const uncertain = v.confidence === "low" && r.note ? " (manuscript reading uncertain)" : "";
      entry = {
        pada: i,
        ref: p.ref,
        canonical: p.text,
        readings: { ...(v.ms ? { ms1878: v.ms } : {}), criticalEdition: v.ce },
        kind: r.kind,
        checked: true,
        significant: r.significant,
        ...(r.note ? { note: r.note + uncertain } : {}),
      };
    } else if (row && (row.band === "probable" || row.band === "definite")) {
      entry = { pada: i, ref: p.ref, canonical: p.text, readings: { criticalEdition: row.otherText }, kind: "ce-differs", checked: false, significant: false };
    } else if (row && row.band === "missing") {
      entry = { pada: i, ref: p.ref, canonical: p.text, readings: { criticalEdition: null }, kind: "not-in-ce", checked: false, significant: false };
    }
    const found = research[i];
    const extra = typeof found === "string" ? found : found?.note;
    const review = reviewNotes[i];
    if (!entry && !extra && !review) return;
    entry ??= { pada: i, ref: p.ref, canonical: p.text, readings: {}, kind: "ce-differs", checked: false, significant: false };
    if (extra) entry.note = extra;
    if (found && typeof found !== "string") {
      if (found.kind) entry.kind = found.kind;
      if (found.readings) entry.readings = found.readings;
    }
    if (review) entry.note = `${entry.note ? entry.note + " " : ""}Reviewer: ${review}`;
    if (extra || review) entry.significant = true;
    out.push(entry);
  });
  return out;
}
