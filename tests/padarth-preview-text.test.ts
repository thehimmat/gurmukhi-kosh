import { describe, it, expect } from "vitest";
import { previewText } from "../lib/padarth/preview-text";
import type { PreviewLine } from "../lib/padarth/preview";

// "Copy as text" (#23): the preview as Markdown-flavoured plain text, in the Japji document's shape,
// for pasting into a slide app until one is chosen.
const line = (extra: Partial<PreviewLine> = {}): PreviewLine => ({
  lineId: 5,
  gurmukhi: "ਸੋਚੈ ਸੋਚਿ ਨ ਹੋਵਈ ॥",
  rows: [
    { surface: "ਸੋਚੈ", text: "ਸੁਚਿ ਰੱਖਣ ਨਾਲ", status: "picked", grammar: [], note: null },
    { surface: "ਸੋਚਿ", text: "purity", status: "override", grammar: [], note: "outer purity" },
    { surface: "ਨ", text: "not", status: "draft", grammar: [], note: null },
    { surface: "ਹੋਵਈ", text: "become", status: "picked", grammar: ["3 sg. subj. of ਹੋਇ"], note: null },
    { surface: "ੴ", text: null, status: "uncovered", grammar: [], note: null },
  ],
  phrases: [{ surface: "ਨ ਹੋਵਈ", text: "ਨਹੀਂ ਹੋ ਸਕਦੀ", status: "picked", grammar: [], note: null }],
  note: "the strong bull of Dharam",
  ...extra,
});

describe("previewText", () => {
  it("writes the verse in bold, a bullet per word, the phrases, then the line note", () => {
    expect(previewText([line()])).toBe(
      [
        "**ਸੋਚੈ ਸੋਚਿ ਨ ਹੋਵਈ ॥**",
        "",
        "- ਸੋਚੈ = ਸੁਚਿ ਰੱਖਣ ਨਾਲ",
        "- ਸੋਚਿ = purity *outer purity*",
        "- ਨ =",
        "- ਹੋਵਈ = become (3 sg. subj. of ਹੋਇ)",
        "- ੴ =",
        "- ਨ ਹੋਵਈ = ਨਹੀਂ ਹੋ ਸਕਦੀ",
        "",
        "*the strong bull of Dharam*",
        "",
      ].join("\n")
    );
  });

  it("leaves an unpicked row's gloss out, so only chosen text reaches the slides", () => {
    expect(previewText([line()])).not.toContain("not");
  });

  it("separates lines with a blank line", () => {
    const text = previewText([line({ note: null, phrases: [] }), line({ lineId: 6, gurmukhi: "ਜੇ ਸੋਚੀ ਲਖ ਵਾਰ ॥", rows: [], phrases: [], note: null })]);
    expect(text).toContain("- ੴ =\n\n**ਜੇ ਸੋਚੀ ਲਖ ਵਾਰ ॥**\n");
  });
});
