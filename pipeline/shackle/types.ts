/**
 * Types for the Shackle "A Guru Nanak Glossary" extraction.
 * Mirrors handoff/schema.ts (the extraction contract). The raw JSONL lives
 * (gitignored) in pipeline/shackle/data/glossary-entries.jsonl.
 */

export interface GlossaryEntry {
  id: string;
  page: number;
  pdfPage?: number;
  gurmukhi: string;
  gurmukhiNormalized: string;
  headword: string;
  homonymIndex?: number;
  notInGuruNanak: boolean;
  secondMemberOnly: boolean;
  inflectionsRaw?: string;
  inflections?: Inflection[];
  posRaw: string;
  partOfSpeech: string[];
  gloss: string;
  glossIsCrossRefOnly: boolean;
  usageNotes?: string;
  compounds?: Compound[];
  examples?: Example[];
  frequency?: Frequency;
  etymologyRaw?: string;
  etymology?: Etymology;
  flags: string[];

  // Present only on appendix entries, added by reverse_appendix.py: the Gurmukhi
  // above is DERIVED (reverse-transliterated), not from the source.
  _derived?: boolean;
  _ambiguities?: ReverseAmbiguity[];
}

export interface ReverseAmbiguity {
  kind: string;
  chosen: string;
  alternatives: string[];
  note: string;
  source: string;
  start: number;
}

export interface Inflection {
  form: string;
  raw: string;
  grammar?: string[];
  contextMark?: string;
}

export interface Compound {
  text: string;
  posRaw?: string;
  partOfSpeech?: string[];
  gloss: string;
  examples?: Example[];
}

export interface Example {
  text: string;
  translation?: string;
  citationRaw: string;
  citation?: Citation;
}

export interface Citation {
  siglum: string;
  hymn?: string;
  verse?: string;
  author?: string;
}

export interface Frequency {
  raw: string;
  count?: number;
  approximate: boolean;
  inBrackets: boolean;
  contextMarks?: string[];
}

export interface Etymology {
  raw: string;
  language?: string;
  cdial?: number;
  sourceForm?: string;
  isHypothetical: boolean;
  doubtful: "no" | "doubtful" | "very-doubtful";
  doubletOf?: string[];
  compare?: string[];
  derivationChain?: string;
}
