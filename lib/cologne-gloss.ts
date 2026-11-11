/**
 * A readable gloss from a Cologne (csl-orig) record body, for the curator's Dictionaries tab. The
 * dictionaries mark Sanskrit and emphasis differently: MW uses <s>…</s>; the rest use {#…#} for
 * Sanskrit in SLP1, {%…%} for italics and {@…@} for bold. They hard-wrap lines and add page
 * markers. Śabdakalpadruma and Vācaspatyam are all-Sanskrit SLP1, with no tags at all.
 *
 * Sanskrit comes out in IAST without accent marks, or, for an all-Sanskrit kosh, the whole body in
 * Devanagari with its line-break hyphens rejoined. The headword/body separator ¦ becomes a dash.
 */
import sanscriptDefault from "@indic-transliteration/sanscript";

const sanscript = (sanscriptDefault as unknown as { t?: unknown }).t
  ? sanscriptDefault
  : (sanscriptDefault as unknown as { default: typeof sanscriptDefault }).default;

const ACCENTS = /[/\\^]/g;
const iast = (slp1: string) => sanscript.t(slp1.replace(ACCENTS, ""), "slp1", "iast");

/** csl-orig codes whose bodies are all Sanskrit, shown in Devanagari. */
export const ALL_SANSKRIT = new Set(["cologne_skd", "cologne_vcp"]);

export function cologneGloss(body: string, mode: "iast" | "devanagari" = "iast"): string {
  let s = body.replace(/\[Page[^\]]*\]/g, "");
  if (mode === "devanagari") {
    s = s
      .replace(/-\n/g, "")
      .replace(/\n/g, " ")
      .replace(/<[^>]*>/g, "")
      .replace(/¦/g, "")
      .replace(/\.\./g, "॥")
      .replace(/(^|\s)\.(?=\s|\)|$)/g, "$1।");
    s = sanscript.t(s.replace(ACCENTS, ""), "slp1", "devanagari")
      // a 0 right after a word is the abbreviation mark (pu0 = पु॰), not a zero
      .replace(/([\u0901-\u094D])०/g, "$1॰");
  } else {
    s = s
      .replace(/\n/g, " ")
      .replace(/<s>([^<]*)<\/s>/g, (_, x: string) => iast(x))
      .replace(/\{#([^#]*)#\}/g, (_, x: string) => iast(x))
      .replace(/\{[%@]([^%@]*)[%@]\}/g, "$1")
      .replace(/<[^>]*\/>/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/^\s*¦\s*/, "")
      .replace(/\s*¦\s*/g, " — ");
  }
  return s.replace(/\s+/g, " ").trim();
}
