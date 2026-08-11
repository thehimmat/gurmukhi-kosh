// Deterministic English rendering of the structured Mahan Kosh parse
// (definitions.parsed, produced by pipeline/mahan-kosh/parse_shorthand.py).
//
// This is #34 step 1: pure templating over the parse plus the decoded 1930
// ਸੰਕੇਤ key (pipeline/mahan-kosh/abbreviations.json). Nothing here translates
// prose — every string is either printed legend data, a parser-decoded field,
// or a fixed template around them.
//
// All Gurmukhi keys are NFD-normalized before lookup: the corpus and the
// legend both must be compared in NFD (decomposed nukta; U+0A59-5E are
// composition-excluded).

import legendJson from "../pipeline/mahan-kosh/abbreviations.json";

// ── Types for definitions.parsed (see parse_shorthand.py parse_sense) ───────

export type ParsedPos = { marker: string; pos: string };
export type ParsedEtymon = { text: string; script: string; inferred?: boolean };
export type ParsedOrigin = {
  marker: string;
  language: string;
  iso639: string | null;
  etymon: ParsedEtymon | null;
};
export type ParsedGrammar = { attribute: string; value: string; referent: string | null };
export type ParsedCitation = {
  raw: string;
  work: string | null;
  work_type: string | null;
  raag: string | null;
  mahala: number | null;
  is_vaar: boolean;
  vaar_number: number | null;
  section: string | null;
  bhagat: string | null;
  work_number: number | null;
};
export type ParsedXref = { target: string; sense_number: number | null };

export type ParsedSense = {
  parser_version: string;
  pos: ParsedPos[];
  language_origins: ParsedOrigin[];
  grammar: ParsedGrammar[];
  citations: ParsedCitation[];
  xrefs: ParsedXref[];
  residue: string;
};

/** Narrows a definitions.parsed jsonb value to the shape the parser emits. */
export function asParsedSense(parsed: Record<string, unknown> | null): ParsedSense | null {
  if (!parsed || typeof parsed.parser_version !== "string") return null;
  return parsed as unknown as ParsedSense;
}

const nfd = (s: string) => s.normalize("NFD");

// ── Legend lookups ──────────────────────────────────────────────────────────

type PosMarkerEntry = { abbr: string; variants: string[]; gurmukhi: string; english: string; pos: string };
const POS_BY_MARKER = new Map<string, PosMarkerEntry>();
for (const e of legendJson.pos_markers.entries as PosMarkerEntry[]) {
  POS_BY_MARKER.set(nfd(e.abbr), e);
  for (const v of e.variants) POS_BY_MARKER.set(nfd(v), e);
}

// "Bilaval (ਬਿਲਾਵਲ)" → compact "Bilaval"; the full printed form stays in titles.
type RaagEntry = { abbr: string; raag: string };
const RAAG_BY_ABBR = new Map<string, RaagEntry>();
for (const e of legendJson.citation_sources.sggs_raags as RaagEntry[]) {
  RAAG_BY_ABBR.set(nfd(e.abbr), e);
}
const compactName = (name: string) => name.replace(/\s*\(.*\)$/, "");

// Parser SECTION_TOKENS values (parse_shorthand.py) → English section names.
const SECTION_EN = new Map<string, string>([
  [nfd("ਅਸਟਪਦੀ"), "Ashtapadi"],
  [nfd("ਛੰਤ"), "Chhant"],
  [nfd("ਸਲੋਕ"), "Salok"],
  [nfd("ਸੋਲਹੇ"), "Solhe"],
]);

// Display romanization of the bhagat names the citation grammar recognizes
// (legend citation_grammar.bhagat_authors). Rendering-layer only — these are
// conventional English spellings, not legend data, so they live here and not
// in abbreviations.json (#43 reviews that file as the decoded printed key).
const BHAGAT_EN = new Map<string, string>([
  [nfd("ਕਬੀਰ"), "Kabir"],
  [nfd("ਫਰੀਦ"), "Farid"],
  [nfd("ਨਾਮਦੇਵ"), "Namdev"],
  [nfd("ਰਵਿਦਾਸ"), "Ravidas"],
  [nfd("ਬੇਣੀ"), "Beni"],
  [nfd("ਤ੍ਰਿਲੋਚਨ"), "Trilochan"],
  [nfd("ਧੰਨਾ"), "Dhanna"],
  [nfd("ਜੈਦੇਵ"), "Jaidev"],
  [nfd("ਸੈਣ"), "Sain"],
  [nfd("ਪੀਪਾ"), "Pipa"],
  [nfd("ਸਧਨਾ"), "Sadhna"],
  [nfd("ਭੀਖਨ"), "Bhikhan"],
  [nfd("ਸੂਰਦਾਸ"), "Surdas"],
  [nfd("ਪਰਮਾਨੰਦ"), "Parmanand"],
  [nfd("ਰਾਮਾਨੰਦ"), "Ramanand"],
  [nfd("ਮਰਦਾਨਾ"), "Mardana"],
  [nfd("ਸੱਤਾ ਬਲਵੰਡ"), "Satta Balvand"],
  [nfd("ਸੁੰਦਰ"), "Sundar"],
]);

// ── POS ─────────────────────────────────────────────────────────────────────

/** "verbal_root" → "Verbal root". */
export function posLabel(pos: string): string {
  const s = pos.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Tooltip citing the printed marker: 'ਸੰਗ੍ਯਾ (ਨਾਮ) — noun · Mahan Kosh printed key'. */
export function posTitle(p: ParsedPos): string {
  const e = POS_BY_MARKER.get(nfd(p.marker));
  if (!e) return `${p.marker} — ${posLabel(p.pos)} · Mahan Kosh marker`;
  return `${e.abbr} (${e.gurmukhi}) — ${e.english} · Mahan Kosh printed key`;
}

// ── Origins ─────────────────────────────────────────────────────────────────

/** 'From Sanskrit' / 'From Persian' lead-in; etymon text renders separately. */
export function originLabel(o: ParsedOrigin): string {
  return `From ${o.language}`;
}

export function originTitle(o: ParsedOrigin): string {
  const base = `${o.marker} — ${o.language} · Mahan Kosh printed key`;
  if (o.etymon?.inferred) {
    return `${base}. The Gurmukhi form shown is our transcription of the marked etymon, not printed in the entry.`;
  }
  return base;
}

// ── Grammar frames ──────────────────────────────────────────────────────────

/** Deterministic English for a decoded grammar frame ('plural of X' etc.). */
export function formatGrammarFrame(g: ParsedGrammar): string {
  const ref = g.referent ? ` of ${g.referent}` : "";
  switch (`${g.attribute}=${g.value}`) {
    case "number=plural": return `Plural${ref}`;
    case "case=vocative": return "Vocative";
    case "mood=imperative": return `Imperative${ref}`;
    case "tense=past": return "Past tense";
    case "tense=present": return "Present tense";
    case "gender=feminine": return "Feminine";
    case "gender=masculine": return "Masculine";
    case "lexical=short_form_of": return `Short form${ref}`;
    default: return `${g.attribute}: ${g.value}${ref}`;
  }
}

// ── Citations ───────────────────────────────────────────────────────────────

/**
 * Decoded English for one parsed citation, e.g. 'Vaar of Majh, Mahala 1',
 * 'Salok Kabir', 'Krishna Avtar (Dasam Granth)'. Falls back to the raw
 * printed abbreviation when nothing decoded.
 */
export function formatCitation(c: ParsedCitation): string {
  const parts: string[] = [];

  if (c.work) parts.push(c.work_number ? `${c.work} ${c.work_number}` : c.work);

  if (c.raag) {
    const raagEn = compactName(RAAG_BY_ABBR.get(nfd(c.raag))?.raag ?? c.raag);
    let s = c.is_vaar ? `Vaar of ${raagEn}` : raagEn;
    if (c.vaar_number != null) s += ` ${c.vaar_number}`;
    parts.push(s);
  } else if (c.is_vaar) {
    parts.push(c.vaar_number != null ? `Vaar ${c.vaar_number}` : "Vaar");
  }

  if (c.section) {
    const sec = SECTION_EN.get(nfd(c.section)) ?? c.section;
    // 'Salok Kabir' reads as one unit; other sections stand alone.
    if (c.bhagat && sec === "Salok") {
      parts.push(`Salok ${BHAGAT_EN.get(nfd(c.bhagat)) ?? c.bhagat}`);
    } else {
      parts.push(sec);
      if (c.bhagat) parts.push(BHAGAT_EN.get(nfd(c.bhagat)) ?? c.bhagat);
    }
  } else if (c.bhagat) {
    parts.push(BHAGAT_EN.get(nfd(c.bhagat)) ?? c.bhagat);
  }

  if (c.mahala != null) parts.push(`Mahala ${c.mahala}`);

  if (parts.length === 0) return c.raw;
  const s = parts.join(", ");
  return c.work_type === "dasam_granth" ? `${s} (Dasam Granth)` : s;
}

/** Unique decoded citations in first-appearance order. */
export function formatCitations(citations: ParsedCitation[]): { text: string; raw: string }[] {
  const seen = new Set<string>();
  const out: { text: string; raw: string }[] = [];
  for (const c of citations) {
    const text = formatCitation(c);
    if (seen.has(text)) continue;
    seen.add(text);
    out.push({ text, raw: c.raw });
  }
  return out;
}

// ── Xrefs ───────────────────────────────────────────────────────────────────

/** NFD forms of every xref target across a word's parsed senses. */
export function collectXrefTargets(senses: (ParsedSense | null)[]): string[] {
  const targets = new Set<string>();
  for (const s of senses) {
    for (const x of s?.xrefs ?? []) targets.add(nfd(x.target));
  }
  return [...targets];
}

export { nfd as nfdNormalize };
