import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PadarthDraftView } from "../components/padarth/DraftView";
import { draftLine } from "../lib/padarth/draft";

// Japji line 9 with a few rows of each kind, shortened from the real ones.
const draft = draftLine({
  lineId: 9,
  // ਕਿਵ is at 0 and 3: the same word.
  tokens: "ਕਿਵ ਸਚਿਆਰਾ ਹੋਈਐ ਕਿਵ ਕੂੜੈ ਤੁਟੈ ਪਾਲਿ"
    .split(" ")
    .map((gurmukhi, position) => ({ position, wordId: [10, 11, 12, 10, 14, 15, 16][position], gurmukhi })),
  definitions: [
    { id: 1, wordId: 10, sourceCode: "mahan_kosh", senseNumber: 1, text: "ਕਿਵੇਂ", textEn: "how", notes: null },
    { id: 2, wordId: 900, sourceCode: "shackle", senseNumber: 1, text: "become, happen", textEn: null, notes: null },
    { id: 3, wordId: 11, sourceCode: "shackle", senseNumber: 1, text: "truthful", textEn: null, notes: "gurmukhi-derived (reverse-translit)" },
  ],
  formLinks: [{ wordId: 12, lexemeId: 7, headwordWordId: 900, headword: "ਹੋਇ", sourceCode: "shackle", labelRaw: "pass. 1 pl.", definitionId: null }],
  padarth: [
    { id: 60, ordinal: 0, term: "ਕੂੜੈ ਪਾਲਿ", gloss: "ਕੂੜ ਦੀ ਕੰਧ", notes: [], isPhrase: true, links: [{ position: 4, match: "gapped", lexemeId: null }, { position: 6, match: "gapped", lexemeId: null }], caseEvidence: [{ gramCase: "genitive", marker: "ਦੀ", basis: "ਕੂੜ ਦੀ" }] },
    { id: 61, ordinal: 1, term: "ਤੁਟੈ", gloss: "ਟੁੱਟੇ", notes: ["ਨੋਟ: <ਕਿਰਿਆ>"], isPhrase: false, links: [{ position: 5, match: "via_base", lexemeId: 8 }], caseEvidence: [] },
    { id: 62, ordinal: 2, term: "ਸਭੁ ਕੋ", gloss: "ਹਰੇਕ ਜੀਵ", notes: [], isPhrase: true, links: [], caseEvidence: [] },
  ],
  grammar: [],
});

const html = renderToStaticMarkup(
  createElement(PadarthDraftView, { lines: [{ id: 9, verse_id: 9, gurmukhi: "ਕਿਵ ਸਚਿਆਰਾ ਹੋਈਐ ਕਿਵ ਕੂੜੈ ਤੁਟੈ ਪਾਲਿ ॥" }], drafts: [draft] })
);
const decode = (s: string) =>
  s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const text = decode(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));

describe("PadarthDraftView", () => {
  it("shows the line, then every word in order, each linking to its word page with the key", () => {
    expect(html).toContain("ਕਿਵ ਸਚਿਆਰਾ ਹੋਈਐ ਕਿਵ ਕੂੜੈ ਤੁਟੈ ਪਾਲਿ ॥");
    expect(html.match(/href="\/admin\/word\/[^"]+"/g)).toHaveLength(7);
    // Curator mode on word pages lives under /admin, behind the cookie: the link carries no key.
    expect(html).toContain(`href="/admin/word/${encodeURIComponent("ਕਿਵ")}"`);
    expect(text.indexOf("ਸਚਿਆਰਾ")).toBeLessThan(text.indexOf("ਹੋਈਐ"));
  });

  it("names each gloss's source, the headword it came through, and a rebuilt spelling", () => {
    expect(text).toContain("ਕਿਵੇਂ");
    expect(text).toContain("how");
    expect(text).toContain("Mahan Kosh");
    expect(text).toMatch(/become, happen.*via ਹੋਇ.*Shackle/);
    expect(text).toMatch(/truthful.*spelling rebuilt from Shackle's romanisation/);
    expect(text).toMatch(/ਟੁੱਟੇ.*Sahib Singh.*through a Shackle paradigm/);
    expect(text).toContain("ਨੋਟ: <ਕਿਰਿਆ>");
  });

  it("states Shackle's label plainly and hedges case evidence, citing the gloss", () => {
    expect(text).toMatch(/pass\. 1 pl\. of ਹੋਇ.*Shackle/);
    expect(text).toMatch(/genitive\?.*Sahib Singh glosses.*ਕੂੜ ਦੀ/);
  });

  it("says when a word is glossed only in a phrase, and when there is nothing at all", () => {
    // ਕੂੜੈ and ਪਾਲਿ are glossed only as the phrase.
    expect(text.match(/Glossed in a phrase below/g)?.length).toBe(2);
    expect(text).not.toContain("No gloss in the database");
    const bare = draftLine({ lineId: 1, tokens: [{ position: 0, wordId: 1, gurmukhi: "ੴ" }], definitions: [], formLinks: [], padarth: [], grammar: [] });
    const out = renderToStaticMarkup(createElement(PadarthDraftView, { lines: [{ id: 1, verse_id: 1, gurmukhi: "ੴ" }], drafts: [bare] }));
    expect(out).toContain("No gloss in the database");
  });

  it("puts phrases after the words, and keeps unplaced entries visible", () => {
    expect(text.indexOf("Phrases")).toBeGreaterThan(text.lastIndexOf("Glossed in a phrase below"));
    expect(text).toContain("ਕੂੜੈ … ਪਾਲਿ");
    expect(text).toMatch(/Not placed on a word.*ਸਭੁ ਕੋ.*ਹਰੇਕ ਜੀਵ/);
  });

  it("names the Mahan Kosh pointer a sense came through, and lists a pointer the corpus can't follow", () => {
    const d = draftLine({
      lineId: 2,
      tokens: [
        { position: 0, wordId: 1, gurmukhi: "ਮੰਞ" },
        { position: 1, wordId: 2, gurmukhi: "ਕੁਚਜੀ" },
      ],
      definitions: [
        { id: 1, wordId: 1, sourceCode: "mahan_kosh", senseNumber: 1, text: "ਦੇਖੋ, ਮੰਞੁ.", textEn: null, notes: null },
        { id: 2, wordId: 50, sourceCode: "mahan_kosh", senseNumber: 1, text: "ਮੈਂ", textEn: null, notes: null },
        { id: 3, wordId: 2, sourceCode: "mahan_kosh", senseNumber: 1, text: "ਦੇਖੋ, ਕੁਚੱਜੀ.", textEn: null, notes: null },
      ],
      formLinks: [],
      padarth: [],
      grammar: [],
      mkPointerTargets: [{ target: "ਮੰਞੁ", wordId: 50 }],
    });
    const out = decode(
      renderToStaticMarkup(createElement(PadarthDraftView, { lines: [{ id: 2, verse_id: 2, gurmukhi: "ਮੰਞ ਕੁਚਜੀ" }], drafts: [d] }))
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
    );
    expect(out).toMatch(/ਮੈਂ.*ਦੇਖੋ ਮੰਞੁ ?, Mahan Kosh/);
    expect(out).not.toContain("ਦੇਖੋ, ਮੰਞੁ");
    expect(out).toMatch(/Mahan Kosh points to ਕੁਚੱਜੀ ?, which isn't in the corpus/);
  });

  it("offers an introduction and a question before each line, open when one is written", () => {
    const render = (props: object) =>
      renderToStaticMarkup(
        createElement(PadarthDraftView, { lines: [{ id: 9, verse_id: 9, gurmukhi: "ਕਿਵ ॥" }], drafts: [draft], ...props })
      );
    const empty = render({});
    expect(empty).toContain("Introduction / question before this line");
    expect(empty).not.toMatch(/<details[^>]*open/);
    const written = render({ commentary: [{ lineId: 9, kind: "question", text: "How, then?" }] });
    expect(written).toMatch(/<details[^>]*open/);
    expect(written).toContain("How, then?");
    expect(written.indexOf("Introduction / question")).toBeLessThan(written.indexOf("ਕਿਵ ॥"));
  });

  it("hides the commentary boxes and says why until migration 086 is applied", () => {
    const out = renderToStaticMarkup(
      createElement(PadarthDraftView, { lines: [{ id: 9, verse_id: 9, gurmukhi: "ਕਿਵ ॥" }], drafts: [draft], commentaryAvailable: false })
    );
    expect(out).not.toContain("Introduction / question before this line");
    expect(out).toContain("need migration 086");
  });

  it("labels a spelling variant's sense, and warns that an ending variant may differ in grammar", () => {
    const d = draftLine({
      lineId: 3,
      tokens: [
        { position: 0, wordId: 1, gurmukhi: "ਨੀਸਾਣੁ" },
        { position: 1, wordId: 2, gurmukhi: "ਗੁਣ" },
      ],
      definitions: [
        { id: 1, wordId: 50, sourceCode: "shackle", senseNumber: 1, text: "banner", textEn: null, notes: null },
        { id: 2, wordId: 51, sourceCode: "shackle", senseNumber: 1, text: "virtue", textEn: null, notes: null },
      ],
      formLinks: [],
      padarth: [],
      grammar: [],
      variants: [
        { wordId: 1, variantWordId: 50, variant: "ਨੀਸਾਨੁ", tier: "spelling" },
        { wordId: 2, variantWordId: 51, variant: "ਗੁਣੁ", tier: "ending" },
      ],
    });
    const out = decode(
      renderToStaticMarkup(createElement(PadarthDraftView, { lines: [{ id: 3, verse_id: 3, gurmukhi: "ਨੀਸਾਣੁ ਗੁਣ" }], drafts: [d] }))
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
    );
    expect(out).toMatch(/banner.*spelling variant ਨੀਸਾਨੁ ?, Shackle/);
    expect(out).toMatch(/virtue.*ending variant ਗੁਣੁ ?, Shackle.*ending may differ in grammar/);
  });

  it("shows a Shackle phrase on its phrase row, naming where in his entry it comes from", () => {
    const d = draftLine({
      lineId: 4,
      tokens: [
        { position: 0, wordId: 1, gurmukhi: "ਅੰਮ੍ਰਿਤ" },
        { position: 1, wordId: 2, gurmukhi: "ਵੇਲਾ" },
      ],
      definitions: [],
      formLinks: [],
      padarth: [],
      grammar: [],
      collocations: [{ id: 7, sourceCode: "shackle", phrase: "ਅੰਮ੍ਰਿਤ ਵੇਲਾ", members: [["ਅੰਮ੍ਰਿਤ"], ["ਵੇਲਾ"]], gloss: "the hour before dawn", posRaw: "m.", origin: "compound" }],
    });
    const out = decode(
      renderToStaticMarkup(createElement(PadarthDraftView, { lines: [{ id: 4, verse_id: 4, gurmukhi: "ਅੰਮ੍ਰਿਤ ਵੇਲਾ" }], drafts: [d] }))
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
    );
    expect(out).toMatch(/Phrases.*ਅੰਮ੍ਰਿਤ ਵੇਲਾ.*the hour before dawn \(m\.\) Shackle, compound ਅੰਮ੍ਰਿਤ ਵੇਲਾ/);
  });

  it("says when Sahib Singh spaces a compound differently from the line", () => {
    const d = draftLine({
      lineId: 5,
      tokens: [{ position: 0, wordId: 1, gurmukhi: "ਭਖਸਾਰ" }],
      definitions: [],
      formLinks: [],
      padarth: [{ id: 81, ordinal: 0, term: "ਭਖ ਸਾਰ", gloss: "ਖਾਣ ਯੋਗ", notes: [], isPhrase: true, links: [{ position: 0, match: "compound", lexemeId: null }], caseEvidence: [] }],
      grammar: [],
    });
    const out = decode(
      renderToStaticMarkup(createElement(PadarthDraftView, { lines: [{ id: 5, verse_id: 5, gurmukhi: "ਭਖਸਾਰ" }], drafts: [d] }))
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
    );
    expect(out).toMatch(/ਖਾਣ ਯੋਗ.*spaced differently in the line \(written ‘ਭਖ ਸਾਰ’\)/);
  });
});
