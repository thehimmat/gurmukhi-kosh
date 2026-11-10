// Read grammatical case *evidence* out of Sahib Singh's pad-arth gloss.
//
// Sahib Singh names a case (ਕਰਤਾ ਕਾਰਕ, ਅਧਿਕਰਣ ਕਾਰਕ) on only 81 of the 50,054
// pad-arth lines, and pipeline/grammar/padarth.ts already extracts those. But he
// renders the word into Punjabi with a postposition on thousands of lines, and
// that postposition shows how he read the word's case:
//   ਤੀਰਥਿ = ਤੀਰਥ ਉੱਤੇ            → locative
//   ਦਰਗਹ = ਅਕਾਲ ਪੁਰਖ ਦੇ ਦਰਬਾਰ ਵਿਚ  → locative
//   ਕਰਮੀ = ਕਰਮ ਨਾਲ                → instrumental
//   ਬੰਦਿ  = ਬੰਦੀ ਤੋਂ               → ablative
//
// This is EVIDENCE, not a declaration. The gloss is his; reading a case out of
// it is ours. So every result carries the marker and the gloss segment it came
// from, for the caller to cite, and the caller must render it hedged rather than
// as a bare case label (the tier-2 rule on #23).
//
// The rule is deliberately conservative: only a *segment-final* postposition is
// taken, because one buried mid-clause governs a word inside the gloss rather
// than the headword —
//   ਪੰਚ = ਉਹ ਮਨੁੱਖ … ਜਿਨ੍ਹਾਂ ਦੀ ਸੁਰਤਿ ਨਾਮ ਵਿਚ ਜੁੜੀ ਹੈ …
// where ਵਿਚ belongs to ਨਾਮ, not to ਪੰਚ. Missing a real case is the acceptable
// failure here; asserting a wrong one is not.
//
// This module is pure (gloss text → evidence). Splitting a pad-arth body into
// its terms is lib/padarth/parse.ts.

export type PadarthCase =
  | "genitive"
  | "locative"
  | "instrumental"
  | "ablative"
  | "objective"
  | "agentive"
  | "vocative";

export type CaseEvidence = {
  /** The case the postposition points to. A candidate, not a verdict. */
  gramCase: PadarthCase;
  /** The postposition, verbatim as the gloss writes it. */
  marker: string;
  /** The gloss segment it was read from, so the reading can be cited. */
  basis: string;
};

// Segment-final postpositions. Spelling variants are listed rather than
// normalised, so the marker reported back is the one the source actually wrote.
//
// Bare ਤੇ is deliberately absent: it is also the conjunction "and"
// (ਸੁਣਿਆ ਹੈ ਤੇ ਮੰਨਿਆ ਹੈ), so accepting it would misread ordinary prose as
// locative. Only the unambiguous ਉੱਤੇ / ਉਤੇ are taken.
const FINAL_MARKERS = new Map<string, PadarthCase>([
  ["ਵਿਚ", "locative"],
  ["ਵਿੱਚ", "locative"],
  ["ਅੰਦਰ", "locative"],
  ["ਉੱਤੇ", "locative"],
  ["ਉਤੇ", "locative"],
  ["ਨਾਲ", "instrumental"],
  ["ਤੋਂ", "ablative"],
  ["ਤੋ", "ablative"],
  ["ਨੂੰ", "objective"],
  ["ਨੇ", "agentive"],
  ["ਦਾ", "genitive"],
  ["ਦੇ", "genitive"],
  ["ਦੀ", "genitive"],
  // ਦਿਆਂ is deliberately absent: segment-final it is always the light verb
  // "I may give/put" (ਅਰਪਉ = ਮੈਂ ਭੇਟਾ ਕਰ ਦਿਆਂ), 65 of 65 in the pad-arth.
]);

// Spelling key for the word lists below: NFC folds precomposed nukta letters
// (ਖ਼) and the two ways of writing ਤਰ੍ਹਾਂ onto one form.
const key = (word: string): string => word.normalize("NFC");
const keySet = (words: string[]): ReadonlySet<string> => new Set(words.map(key));

// A ਦੇ/ਦਾ/ਦੀ right after one of these stems is ਦੇਣਾ as a light verb, the
// imperative "give / do it" (ਛੋਡਿ = ਛੱਡ ਦੇ; ਜਾਲੁ = ਸਾੜ ਦੇ), not a genitive. The
// list is the stems the pad-arth actually ends a gloss with.
const LIGHT_VERB_STEMS = keySet([
  "ਕਰ", "ਸਾੜ", "ਛੱਡ", "ਛਡ", "ਤਿਆਗ", "ਕੱਢ", "ਪਾ", "ਬਣਾ", "ਮਿਲਾ", "ਵਿਖਾ",
  "ਰੱਖ", "ਧਰ", "ਵੇਚ", "ਸੁੱਟ", "ਲਾ", "ਮਿਟਾ", "ਬਖ਼ਸ਼", "ਬਖਸ਼",
]);

// "of this kind / of many kinds / equal to": the gloss renders an adjective
// (ਤ੍ਰਿਬਿਧਿ = ਤਿੰਨ ਕਿਸਮ ਦੀ; ਜੇਵਡੁ = ਬਰਾਬਰ ਦਾ), so the genitive belongs to the
// Punjabi paraphrase, not to the headword.
const ADJECTIVAL_GENITIVE_HEADS = keySet(["ਕਿਸਮ", "ਕਿਸਮਾਂ", "ਬਰਾਬਰ", "ਤਰ੍ਹਾਂ", "ਪ੍ਰਕਾਰ", "ਭਾਂਤ"]);

// Adverbial idioms that end in a postposition: ਸਰਪਰ = ਆਖ਼ਿਰ ਨੂੰ ("in the end").
const IDIOM_HEADS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["ਨੂੰ", keySet(["ਆਖ਼ਿਰ", "ਆਖ਼ਰ", "ਆਖਿਰ", "ਆਖਰ", "ਅਖ਼ੀਰ", "ਅਖੀਰ"])],
]);

/** ਹੇ opens a vocative gloss: ਦਾਤਾਰ = ਹੇ ਦੇਣਹਾਰ ਅਕਾਲ ਪੁਰਖ! */
const VOCATIVE_MARKER = "ਹੇ";

// Genitive is the weakest signal: ਦਾ/ਦੇ/ਦੀ pervade Punjabi noun phrases, and one
// can trail a phrase whose real marker came earlier (ਤਨਿ = ਸਰੀਰ ਵਿਚ ਦੇ, which is
// locative, not genitive). So a genitive at the end yields only when no stronger
// marker appears in the same segment.
const GENITIVE: ReadonlySet<PadarthCase> = new Set<PadarthCase>(["genitive"]);

// Sahib Singh discusses grammar in prose on some lines, quoting the words under
// discussion ("'ਸਾਚੁ' ਪੁਲਿੰਗ ਹੈ"). Quoted metalanguage is not a gloss of the
// head-word, so such a segment is skipped rather than mined for a postposition.
const QUOTED_METALANGUAGE = /['‘’"“”]/;

// Sense alternatives inside one gloss are separated by commas, semicolons or
// dandas; each is its own candidate phrase.
const SEGMENT = /[,;।॥]/;

// Trailing material that must not hide the final postposition: a parenthetical
// aside (ਮਨ ਵਿਚ (ਭਾਵ)), quotes, and sentence punctuation.
const TRAILING_ASIDE = /\s*\([^()]*\)\s*$/;
const TRAILING_PUNCT = /[\s.!?…'"”’]+$/;

function tidy(segment: string): string {
  let out = segment.replace(/\s+/g, " ").trim();
  // An aside can repeat: "ਇਸ਼ਨਾਨ (ਕੀਤਾ ਹੈ) (ਭਾਵ)".
  for (;;) {
    const stripped = out.replace(TRAILING_ASIDE, "");
    if (stripped === out) break;
    out = stripped;
  }
  return out.replace(TRAILING_PUNCT, "").trim();
}

/**
 * Case evidence from one pad-arth gloss, in the order the segments appear, at
 * most one result per case. An empty array means the gloss carries no
 * postpositional signal — the honest answer for a plain nominal gloss
 * (ਮਾਨੁ = ਆਦਰ; ਵਡਿਆਈ) and for a clause whose postposition is not the
 * headword's.
 */
export function caseEvidence(gloss: string): CaseEvidence[] {
  const out: CaseEvidence[] = [];
  const seen = new Set<PadarthCase>();

  for (const raw of gloss.split(SEGMENT)) {
    const basis = tidy(raw);
    if (basis.length === 0 || QUOTED_METALANGUAGE.test(basis)) continue;

    const words = basis.split(" ").filter(Boolean);
    if (words.length === 0) continue;

    // A vocative is marked at the front, every other case at the end.
    const candidate: { gramCase: PadarthCase; marker: string } | null =
      words[0] === VOCATIVE_MARKER
        ? { gramCase: "vocative", marker: VOCATIVE_MARKER }
        : lastWordMarker(words);

    if (!candidate || seen.has(candidate.gramCase)) continue;
    seen.add(candidate.gramCase);
    out.push({ ...candidate, basis });
  }

  return out;
}

function lastWordMarker(words: string[]): { gramCase: PadarthCase; marker: string } | null {
  // A one-word gloss that is itself only a postposition says nothing about the
  // headword; a postposition needs something before it to govern.
  if (words.length < 2) return null;

  const last = words[words.length - 1];
  const gramCase = FINAL_MARKERS.get(last);
  if (!gramCase) return null;

  const before = key(words[words.length - 2]);
  if (IDIOM_HEADS.get(last)?.has(before)) return null;
  if (!GENITIVE.has(gramCase)) return { gramCase, marker: last };

  // The segment ends in a verb or an adjectival paraphrase, so any earlier
  // postposition governs a word inside the gloss: yield nothing.
  if (LIGHT_VERB_STEMS.has(before) || ADJECTIVAL_GENITIVE_HEADS.has(before)) return null;

  // Trailing genitive: yield to a stronger marker earlier in the segment.
  for (let i = words.length - 2; i >= 1; i--) {
    const earlier = FINAL_MARKERS.get(words[i]);
    if (earlier && !GENITIVE.has(earlier)) return { gramCase: earlier, marker: words[i] };
  }
  return { gramCase, marker: last };
}
