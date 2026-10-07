// Resolve Shackle cross-references to the Gurmukhi entry they point at (#131).
//
// Two kinds exist in the extraction:
// - gloss-less entries (glossIsCrossRefOnly) such as mana¹, printed as an
//   inflected form of another headword; the extraction dropped the target, so
//   it is recovered from the entry that lists this form among its inflections
//   (manu: "so. mana¹");
// - printed pointers in the gloss, "see SARU¹", naming a headword.
// Both resolve only on an exact headword + homonym-number match, never a guess.

import type { GlossaryEntry } from "./types";

export type CrossRefEntry = Pick<
  GlossaryEntry,
  "gurmukhi" | "headword" | "homonymIndex" | "gloss" | "glossIsCrossRefOnly" | "inflectionsRaw" | "inflections"
>;

const SUPERSCRIPTS: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };

/** "mana¹" → "mana|1"; "manna" → "manna|". Drops Shackle's ʳ (rare) mark. */
export function romanKey(token: string): string {
  const t = token.normalize("NFC").replace(/ʳ/g, "").replace(/[.,;:()[\]?]/g, "").trim();
  const m = t.match(/^(.*?)([⁰¹²³⁴⁵⁶⁷⁸⁹]*)$/u)!;
  return `${m[1].toLowerCase()}|${[...m[2]].map((c) => SUPERSCRIPTS[c]).join("")}`;
}

function entryKey(e: CrossRefEntry): string {
  return `${e.headword.normalize("NFC").toLowerCase()}|${e.homonymIndex ?? ""}`;
}

export interface CrossRefIndex {
  byHeadword: Map<string, string>;
  byInflection: Map<string, Set<string>>;
}

export function buildCrossRefIndex(entries: readonly CrossRefEntry[]): CrossRefIndex {
  const byHeadword = new Map<string, string>();
  const byInflection = new Map<string, Set<string>>();
  for (const e of entries) {
    byHeadword.set(entryKey(e), e.gurmukhi);
    const forms = [
      ...(e.inflections ?? []).map((i) => i.form),
      ...(e.inflectionsRaw ?? "").split(/[\s,;()]+/),
    ];
    for (const f of forms) {
      if (!f || f.startsWith("-")) continue;
      const k = romanKey(f);
      if (k.startsWith("|")) continue;
      (byInflection.get(k) ?? byInflection.set(k, new Set()).get(k)!).add(e.gurmukhi);
    }
  }
  return { byHeadword, byInflection };
}

/** Gurmukhi targets of an entry's cross-references, deduped, excluding itself. */
export function resolveCrossRefs(e: CrossRefEntry, index: CrossRefIndex): string[] {
  const out = new Set<string>();
  if (e.glossIsCrossRefOnly && !(e.gloss ?? "").trim()) {
    for (const g of index.byInflection.get(entryKey(e)) ?? []) out.add(g);
  }
  for (const m of (e.gloss ?? "").matchAll(/\bsee ([\p{Lu}\p{M}]+[⁰¹²³⁴⁵⁶⁷⁸⁹]*)/gu)) {
    const g = index.byHeadword.get(romanKey(m[1]));
    if (g) out.add(g);
  }
  out.delete(e.gurmukhi);
  return [...out];
}
