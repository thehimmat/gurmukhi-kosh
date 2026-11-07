// Shackle's phrases (#163): the multi-word expressions his glossary defines, for the pad-arth
// builder's phrase rows. Two places in an entry carry them, both in his romanisation:
//
//   compounds[]   structured: "ammrita velā" with its own gloss and part of speech
//   usageNotes    free text: "only as ita uta 'everywhere'", "uṭṭhi jāi, uṭṭhī calli 'get up and go'"
//
// Only phrases with a gloss of their own are kept; "( + kari)" names a construction but doesn't
// say what it means. A phrase is two or more words: a one-word compound ("satināmu") isn't a
// phrase on a line. Each word gets its candidate Gurmukhi spellings (reverse.ts, as the #18 form
// links), so the builder can match a phrase against a line's words without guessing.
//
// Deliberately strict on usage notes: a phrase is the run of romanised words right before a quoted
// gloss, stopping at an abbreviation ("as adv."), a citation ("MlV16") or a marker word ("as",
// "only"). Anything else is left alone.

import { candidateSpellings, reverseTransliterate } from "./reverse";
import type { GlossaryEntry } from "./types";

/** A romanised Gurmukhi word: lower-case letters and diacritics, no dot, digit or bracket. */
const ROMAN_WORD = /^[\p{Ll}\p{M}]+$/u;

/** Words that introduce a phrase in Shackle's notes rather than belong to it. */
const MARKERS = new Set(["as", "in", "only", "also", "and", "or", "the", "of", "with", "esp", "cf", "see", "comm", "sim", "sl", "int", "abs", "a", "p"]);

const SUPERSCRIPT = /[⁰¹²³⁴⁵⁶⁷⁸⁹]/g;
// A citation: a work's siglum with its hymn number, "MlV16", "AsV9.2", "Sl29".
const CITATION = /\b[A-Z][A-Za-z]*\d[\d.]*\b/g;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const isPhrase = (ws: string[]) => ws.length >= 2 && ws.every((w) => ROMAN_WORD.test(w) && !MARKERS.has(w));

/** The phrases a compound's text names: alternatives split, an optional "(word)" read both ways. */
export function compoundPhrases(text: string): string[] {
  const out: string[] = [];
  for (const alt of text.replace(SUPERSCRIPT, "").split(/\s*,\s*/)) {
    // "(-īṁ)": an inflected ending, not a word.
    const base = alt.replace(/\(\s*-[^)]*\)/g, " ");
    const optional = /\(([^()]+)\)/.exec(base);
    const readings = optional ? [base.replace(optional[0], optional[1]), base.replace(optional[0], " ")] : [base];
    for (const r of readings) {
      const ws = words(r);
      const phrase = ws.join(" ");
      if (isPhrase(ws) && !out.includes(phrase)) out.push(phrase);
    }
  }
  return out;
}

/** The glossed phrases in a usage note: the romanised words right before each quoted gloss. */
export function usagePhrases(notes: string): { phrase: string; gloss: string }[] {
  // A bracketed aside ("[hardly as most comm. 'at dawn']", "[=URADHĀRI]") is Shackle's comment,
  // never the phrase or its gloss.
  const text = notes.replace(/\[[^\]]*\]/g, " ");
  const out: { phrase: string; gloss: string }[] = [];
  const gloss = /'([^']+)'/g;
  let from = 0;
  for (let m = gloss.exec(text); m; m = gloss.exec(text)) {
    const before = text
      .slice(from, m.index)
      .replace(/\([^)]*\)/g, " ")
      .replace(CITATION, " ")
      .replace(SUPERSCRIPT, "");
    from = m.index + m[0].length;
    for (const alt of before.split(/[,;:]/)) {
      // The trailing run of romanised words, stopping at the first that isn't one.
      const ws = words(alt);
      let start = ws.length;
      while (start > 0 && ROMAN_WORD.test(ws[start - 1]) && !MARKERS.has(ws[start - 1])) start--;
      const run = ws.slice(start);
      if (isPhrase(run)) out.push({ phrase: run.join(" "), gloss: m[1].trim() });
    }
  }
  return out;
}

export type CollocationRow = {
  /** The glossary entry it came from (GlossaryEntry.id). */
  sourceEntry: string;
  /** That entry's headword, in Gurmukhi. */
  headGurmukhi: string;
  phraseRoman: string;
  /** The primary reverse transliteration, for display. */
  phraseGurmukhi: string;
  /** Per word, every Gurmukhi spelling its romanisation allows, primary first. */
  members: string[][];
  gloss: string;
  posRaw: string | null;
  origin: "compound" | "usage";
};

function spellings(roman: string): string[] {
  return candidateSpellings(reverseTransliterate(roman)).map((g) => g.normalize("NFC"));
}

/** Every phrase in these entries, one row per entry and phrase (the first gloss wins). */
export function planCollocations(entries: GlossaryEntry[]): CollocationRow[] {
  const rows: CollocationRow[] = [];
  for (const e of entries) {
    const seen = new Set<string>();
    const add = (phraseRoman: string, gloss: string, posRaw: string | null, origin: CollocationRow["origin"]) => {
      if (!gloss.trim() || seen.has(phraseRoman)) return;
      seen.add(phraseRoman);
      const members = words(phraseRoman).map(spellings);
      rows.push({
        sourceEntry: e.id,
        headGurmukhi: e.gurmukhi,
        phraseRoman,
        phraseGurmukhi: members.map((m) => m[0]).join(" "),
        members,
        gloss: gloss.trim(),
        posRaw,
        origin,
      });
    };
    for (const c of e.compounds ?? []) for (const p of compoundPhrases(c.text)) add(p, c.gloss, c.posRaw ?? null, "compound");
    for (const u of usagePhrases(e.usageNotes ?? "")) add(u.phrase, u.gloss, null, "usage");
  }
  return rows;
}
