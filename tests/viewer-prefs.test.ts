import { describe, expect, it } from "vitest";
import {
  applyViewerPrefs, parseViewerPrefs, resourcesByLine, viewerCss, withChoice,
  type PickerState,
} from "../lib/line-context";

// #224: the viewer remembers what the reader changed, not a snapshot of what
// was on. A source the reader never touched follows each page's default.

const ALL = new Set(["ssk_en", "banidb_en", "manmohan_en", "ss_darpan", "faridkot", "manmohan_pa"]);
const NO_SSK = new Set(["banidb_en", "manmohan_en", "ss_darpan"]);

const defaults = (present: Set<string>): PickerState => ({
  view: "translation",
  on: {
    translation: ["ssk_en", "banidb_en", "manmohan_en"].filter((s) => present.has(s) && !(s === "banidb_en" && present.has("ssk_en"))),
    commentary: ["ss_darpan", "faridkot", "manmohan_pa"].filter((s) => present.has(s)),
  },
});

describe("parseViewerPrefs", () => {
  it("keeps a valid view and boolean choices for known sources", () => {
    expect(parseViewerPrefs({ view: "commentary", choices: { faridkot: false, banidb_en: true } }))
      .toEqual({ view: "commentary", choices: { faridkot: false, banidb_en: true } });
  });

  it("drops anything malformed rather than throwing", () => {
    expect(parseViewerPrefs(null)).toEqual({ choices: {} });
    expect(parseViewerPrefs("x")).toEqual({ choices: {} });
    expect(parseViewerPrefs([1, 2])).toEqual({ choices: {} });
    expect(parseViewerPrefs({ view: "bogus", choices: "ssk_en" })).toEqual({ choices: {} });
    expect(parseViewerPrefs({ view: "translation", choices: { ssk_en: "yes", nope_src: false, manmohan_en: false } }))
      .toEqual({ view: "translation", choices: { manmohan_en: false } });
  });
});

describe("applyViewerPrefs", () => {
  it("leaves the page's defaults alone when nothing was chosen", () => {
    expect(applyViewerPrefs(defaults(ALL), { choices: {} }, ALL)).toEqual(defaults(ALL));
  });

  it("does not carry one page's defaults over to the next (the SSK bug)", () => {
    // On a shabad without SSK the reader turns Manmohan off…
    const prefs = withChoice({ choices: {} }, "manmohan_en", false);
    expect(applyViewerPrefs(defaults(NO_SSK), prefs, NO_SSK).on.translation).toEqual(["banidb_en"]);
    // …and on the next shabad, which has SSK, SSK still shows.
    expect(applyViewerPrefs(defaults(ALL), prefs, ALL).on.translation).toEqual(["ssk_en"]);
  });

  it("lets the reader turn on a source that starts off", () => {
    const prefs = withChoice({ choices: {} }, "banidb_en", true);
    expect(applyViewerPrefs(defaults(ALL), prefs, ALL).on.translation).toEqual(["ssk_en", "banidb_en", "manmohan_en"]);
  });

  it("restores the chosen view only where the page has it", () => {
    expect(applyViewerPrefs(defaults(ALL), { view: "commentary", choices: {} }, ALL).view).toBe("commentary");
    const translationOnly = new Set(["banidb_en"]);
    expect(applyViewerPrefs(defaults(translationOnly), { view: "commentary", choices: {} }, translationOnly).view).toBe("translation");
  });
});

describe("resourcesByLine", () => {
  it("keeps one resource per line and source", () => {
    const row = (source_code: string, body: string) => ({ line_id: 1, source_code, language: "en", body_unicode: body, caveat: null });
    const byLine = resourcesByLine([row("ssk_en", "first"), row("ssk_en", "again")]);
    expect(byLine.get(1)!.map((r) => r.body_unicode)).toEqual(["first"]);
  });
});

describe("viewerCss", () => {
  it("shows each source when switched on, and hides a line's empty note once one of its sources shows", () => {
    const css = viewerCss(["ssk_en"]);
    expect(css).toContain(`#viewer-lines[data-on-ssk_en="1"] .viewer-res[data-src="ssk_en"]{display:block}`);
    expect(css).toContain(`#viewer-lines[data-on-ssk_en="1"] .viewer-empty{display:block}`);
    expect(css).toContain(`#viewer-lines[data-on-ssk_en="1"] .viewer-cell:has(> .viewer-res[data-src="ssk_en"]) > .viewer-empty{display:none}`);
  });
});

describe("viewer empty states", () => {
  const line = (id: number) => ({
    id, verse_id: id, shabad_id: 1, ang: 1, line_no: id, gurmukhi: "ਸਤਿ ਨਾਮੁ", translation_en: null,
    transliteration_en: null, source_fk: 1, vishraam: null, shabads: null,
  });
  const ctx = (sources: { code: string; name: string; author: string | null }[], resources: Map<number, never[]> | Map<number, unknown[]>) => ({
    lineId: 1, scope: "passage" as const, lines: [line(1), line(2)], resources, sources,
    source: { code: "sggs_banidb_v2", name: "Sri Guru Granth Sahib Ji" }, shabad: null, passage: null, prevId: null, nextId: null,
  });

  it("gives every line a hidden-by-default note for when none of the shown sources has it", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const { LineView } = await import("../components/line/LineView");
    const res = new Map([[1, [{ line_id: 1, source_code: "ssk_en", language: "en", body_unicode: "True Name", caveat: null }]]]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const html = renderToStaticMarkup(createElement(LineView, { ctx: ctx([{ code: "ssk_en", name: "SSK", author: null }], res) as any }));
    expect(html.match(/class="viewer-cell"/g)).toHaveLength(2);
    expect(html.match(/class="viewer-empty"/g)).toHaveLength(2);
    expect(html).toContain("Not in the selected sources");
  });

  it("says so once when the passage has no translations or commentaries at all", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const { LineView } = await import("../components/line/LineView");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const html = renderToStaticMarkup(createElement(LineView, { ctx: ctx([], new Map()) as any }));
    expect(html).toContain("No translations or commentaries for this passage yet");
    expect(html).not.toContain("viewer-empty");
  });

  it("prompts for a source when the reader has switched every one off", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const { ResourcePicker } = await import("../components/line/ResourcePicker");
    const html = renderToStaticMarkup(createElement(ResourcePicker, {
      sources: [{ code: "ssk_en", name: "SSK", author: null }],
      initial: { view: "translation", on: { translation: [] } },
    }));
    expect(html).toContain("All sources are hidden");
  });
});
