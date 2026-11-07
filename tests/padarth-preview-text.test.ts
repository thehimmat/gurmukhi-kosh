import { describe, it, expect } from "vitest";
import { previewHtml, previewText } from "../lib/padarth/preview-text";
import type { PreviewLine } from "../lib/padarth/preview";

// "Copy as text" (#23): the preview as Markdown-flavoured plain text, in the Japji document's shape,
// for pasting into a slide app until one is chosen.
const line = (extra: Partial<PreviewLine> = {}): PreviewLine => ({
  lineId: 5,
  introduction: null,
  question: null,
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

  it("puts the introduction, then the question, before the verse", () => {
    const text = previewText([line({ introduction: "Purity cannot be had by bathing.", question: "How, then?", rows: [], phrases: [], note: null })]);
    expect(text).toBe("*Purity cannot be had by bathing.*\n\n*Question:* How, then?\n\n**ਸੋਚੈ ਸੋਚਿ ਨ ਹੋਵਈ ॥**\n\n");
  });
});

// The same, as HTML, so pasting into Google Slides keeps the bold, italics and bullets.
describe("previewHtml", () => {
  it("writes the verse in bold, a list item per row, the line note in italics, and escapes text", () => {
    const html = previewHtml([line({ note: "a <b> note", question: "How, then?" })]);
    expect(html).toBe(
      "<p><b>Question:</b> How, then?</p>" +
        "<p><b>ਸੋਚੈ ਸੋਚਿ ਨ ਹੋਵਈ ॥</b></p>" +
        "<ul>" +
        "<li><b>ਸੋਚੈ</b> = ਸੁਚਿ ਰੱਖਣ ਨਾਲ</li>" +
        "<li><b>ਸੋਚਿ</b> = purity <i>outer purity</i></li>" +
        "<li><b>ਨ</b> =</li>" +
        "<li><b>ਹੋਵਈ</b> = become (3 sg. subj. of ਹੋਇ)</li>" +
        "<li><b>ੴ</b> =</li>" +
        "<li><b>ਨ ਹੋਵਈ</b> = ਨਹੀਂ ਹੋ ਸਕਦੀ</li>" +
        "</ul>" +
        "<p><i>a &lt;b&gt; note</i></p>"
    );
  });
});
