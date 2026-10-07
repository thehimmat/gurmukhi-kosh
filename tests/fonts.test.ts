/**
 * Every font family the UI names must be one the root layout actually loads.
 * next/font registers families under hashed names, so a literal "Inter" in an
 * inline style silently fell back to the system font (#123).
 * Run: npm test
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(tsx?|css)$/.test(name) ? [p] : [];
  });
}

/** Quoted family names inside fontFamily: '…' (TSX) and font-family: …; (CSS). */
function namedFamilies(text: string): string[] {
  const values = [
    ...[...text.matchAll(/fontFamily:\s*(['"`])(.*?)\1/g)].map((m) => m[2]),
    ...[...text.matchAll(/font-family:\s*([^;]+);/g)].map((m) => m[1]),
  ];
  return values.flatMap((v) => [...v.matchAll(/\\?"([^"\\]+)\\?"/g)].map((m) => m[1]));
}

/** Family names requested from Google Fonts by the root layout's <link>s. */
function loadedFamilies(layout: string): Set<string> {
  const urls = [...layout.matchAll(/https:\/\/fonts\.googleapis\.com\/css2\?[^"]+/g)].map((m) => m[0]);
  return new Set(
    urls.flatMap((u) =>
      [...u.matchAll(/family=([^:&]+)/g)].map((m) => decodeURIComponent(m[1]).replace(/\+/g, " "))
    )
  );
}

describe("fonts", () => {
  it("every font family named in app/ and components/ is loaded by the root layout", () => {
    const loaded = loadedFamilies(readFileSync(join(ROOT, "app/layout.tsx"), "utf8"));
    const named = new Set(
      [...sourceFiles(join(ROOT, "app")), ...sourceFiles(join(ROOT, "components"))].flatMap((f) =>
        namedFamilies(readFileSync(f, "utf8"))
      )
    );
    expect(named.size).toBeGreaterThan(0);
    expect([...named].filter((f) => !loaded.has(f))).toEqual([]);
  });
});
