/**
 * Site name (#133): ਗੁਰਬਾਣੀ ਖੋਜ ਕੋਸ਼ / Gurbani Search Dictionary, one constant
 * shared by every title and header so the name cannot drift between pages.
 * Run: npm test
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { NAV_LINKS, SITE_NAME_EN, SITE_NAME_PA, activeNavHref, pageTitle } from "../lib/site";

describe("site name", () => {
  it("is ਗੁਰਬਾਣੀ ਖੋਜ ਕੋਸ਼ with no separator dot, and Gurbani Search Dictionary in English", () => {
    expect(SITE_NAME_PA).toBe("ਗੁਰਬਾਣੀ ਖੋਜ ਕੋਸ਼");
    expect(SITE_NAME_EN).toBe("Gurbani Search Dictionary");
  });

  it("titles a page as '<page> — Gurbani Search Dictionary'", () => {
    expect(pageTitle("Browse")).toBe("Browse — Gurbani Search Dictionary");
  });

  it("leaves no old name in app/ or components/", () => {
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : [];
      });
    const root = join(__dirname, "..");
    const stale = [...files(join(root, "app")), ...files(join(root, "components"))].filter((f) =>
      /Gurmukhi Kosh|ਗੁਰਮੁਖੀ ਕੋਸ਼|ਖੋਜ · ਕੋਸ਼/.test(readFileSync(f, "utf8"))
    );
    expect(stale).toEqual([]);
  });
});

describe("site nav (#127)", () => {
  it("links Search, Browse, Read by ang and About, in that order", () => {
    expect(NAV_LINKS.map((l) => [l.label, l.href])).toEqual([
      ["Search", "/"],
      ["Browse", "/browse"],
      ["Read by ang", "/ang/1"],
      ["About", "/about"],
    ]);
  });

  it.each([
    ["/", "/"],
    [`/word/${encodeURIComponent("ਹਉਮੈ")}`, "/"],
    ["/browse", "/browse"],
    ["/ang/27", "/ang/1"],
    ["/about/mahan-kosh-key", "/about"],
    ["/health", null],
  ])("marks %s as the %s section", (path, href) => {
    expect(activeNavHref(path)).toBe(href);
  });
});
