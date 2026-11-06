import { describe, it, expect } from "vitest";
import { parseScope, scopeHref } from "../lib/padarth/scope";

describe("parseScope", () => {
  it("reads an ang, defaulting to Guru Granth Sahib", () => {
    expect(parseScope({ ang: "1" })).toEqual({ kind: "ang", sourceCode: "sggs_banidb_v2", ang: 1 });
    expect(parseScope({ ang: "12", source: "dasam_banidb_v2" })).toEqual({ kind: "ang", sourceCode: "dasam_banidb_v2", ang: 12 });
  });

  it("reads a shabad, and a bani paragraph (Japji paragraph 4 is Pauri 1)", () => {
    expect(parseScope({ shabad: "1" })).toEqual({ kind: "shabad", shabadId: 1 });
    expect(parseScope({ bani: "2", p: "4" })).toEqual({ kind: "paragraph", baniId: 2, ordinal: 4 });
  });

  it.each([
    [{}],
    [{ ang: "0" }],
    [{ ang: "-3" }],
    [{ ang: "1.5" }],
    [{ ang: "1e3" }],
    [{ ang: " 1" }],
    [{ ang: "١" }],
    [{ shabad: "abc" }],
    [{ bani: "2" }],
    [{ bani: "2", p: "0" }],
    [{ ang: "1", source: "Robert'); drop table" }],
    [{ ang: ["1", "2"] }],
  ])("refuses %j", (params) => {
    expect(parseScope(params)).toBeNull();
  });
});

describe("scopeHref", () => {
  it("builds the page link for a scope, carrying the key", () => {
    expect(scopeHref({ kind: "paragraph", baniId: 2, ordinal: 5 }, "k y")).toBe("/admin/padarth?bani=2&p=5&key=k+y");
    expect(scopeHref({ kind: "ang", sourceCode: "sggs_banidb_v2", ang: 2 }, null)).toBe("/admin/padarth?ang=2");
    expect(scopeHref({ kind: "ang", sourceCode: "dasam_banidb_v2", ang: 2 }, null)).toBe("/admin/padarth?ang=2&source=dasam_banidb_v2");
    expect(scopeHref({ kind: "shabad", shabadId: 9 }, null)).toBe("/admin/padarth?shabad=9");
  });
});
