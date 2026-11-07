import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PadarthPreview } from "../components/padarth/Preview";
import type { PreviewLine } from "../lib/padarth/preview";

const lines: PreviewLine[] = [
  {
    lineId: 5,
    gurmukhi: "ਸੋਚੈ ਸੋਚਿ ਨ ਹੋਵਈ ॥",
    rows: [
      { surface: "ਸੋਚੈ", text: "ਸੁਚਿ ਰੱਖਣ ਨਾਲ", status: "picked", grammar: [], note: null },
      { surface: "ਸੋਚਿ", text: "purity", status: "override", grammar: [], note: "outer <purity>" },
      { surface: "ਨ", text: "not", status: "draft", grammar: [], note: null },
      { surface: "ਹੋਵਈ", text: "become", status: "picked", grammar: ["3 sg. subj. of ਹੋਇ"], note: null },
      { surface: "ੴ", text: null, status: "uncovered", grammar: [], note: null },
    ],
    phrases: [{ surface: "ਨ ਹੋਵਈ", text: "ਨਹੀਂ ਹੋ ਸਕਦੀ", status: "picked", grammar: [], note: null }],
    note: "the strong bull of Dharam",
  },
];

const html = renderToStaticMarkup(createElement(PadarthPreview, { lines }));
const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

describe("PadarthPreview", () => {
  it("shows the verse in bold, then a row per word in the document's shape", () => {
    expect(html).toContain("<strong");
    expect(text).toContain("ਸੋਚੈ ਸੋਚਿ ਨ ਹੋਵਈ ॥");
    expect(text).toContain("ਸੋਚੈ = ਸੁਚਿ ਰੱਖਣ ਨਾਲ");
    expect(text).toContain("ਹੋਵਈ = become (3 sg. subj. of ਹੋਇ)");
    expect(text).toContain("ੴ = —");
  });

  it("marks an unpicked row and keeps notes, phrases after the words, and the line note last", () => {
    expect(html).toMatch(/padarth-preview-draft[^>]*>[^]*not/);
    expect(text).toMatch(/unpicked/);
    expect(text).toContain("outer <purity>");
    expect(text.indexOf("ਨ ਹੋਵਈ = ਨਹੀਂ ਹੋ ਸਕਦੀ")).toBeGreaterThan(text.indexOf("ੴ = —"));
    expect(text.lastIndexOf("the strong bull of Dharam")).toBeGreaterThan(text.indexOf("ਨ ਹੋਵਈ = ਨਹੀਂ ਹੋ ਸਕਦੀ"));
  });

  it("counts what is still unpicked", () => {
    expect(text).toContain("2 of 6 rows not yet picked");
  });

  it("offers the preview as text to copy", () => {
    expect(html).toMatch(/<button[^>]*>Copy as text<\/button>/);
  });
});
