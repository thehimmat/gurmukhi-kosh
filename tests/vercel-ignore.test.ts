/**
 * Vercel's Ignored Build Step (vercel.json ignoreCommand, scripts/vercel-ignore.mjs): a push whose
 * changes can't affect the deployed app (migrations, pipelines, catalogue sweeps, docs, tests) is not
 * deployed. Every production deployment starts a fresh ISR cache, so the ~80% of merges that are
 * data-only were re-rendering pages for nothing (Oct 2026 Hobby overage).
 * Run: npm test
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { APP_IMPORTED_FILES, shouldBuild } from "../scripts/vercel-ignore.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("shouldBuild", () => {
  it("skips a push that only touches data, pipelines, docs or tests", () => {
    expect(shouldBuild(["supabase/migrations/079_mark_order.sql", "supabase/APPLIED.md"])).toBe(false);
    expect(shouldBuild(["pipeline/catalogue/sweeps/2026-10-29.json", "pipeline/catalogue/README.md"])).toBe(false);
    expect(shouldBuild(["docs/local-rehearsal.md", "tests/mark-order.test.ts", "user-stories/INDEX.md"])).toBe(false);
    expect(shouldBuild(["selfhost/Caddyfile", ".github/workflows/ci.yml", "README.md"])).toBe(false);
  });

  it("builds when any app file changes", () => {
    expect(shouldBuild(["supabase/APPLIED.md", "app/word/[gurmukhi]/page.tsx"])).toBe(true);
    expect(shouldBuild(["components/word/TabNav.tsx"])).toBe(true);
    expect(shouldBuild(["lib/curator.ts"])).toBe(true);
    expect(shouldBuild(["public/robots.txt"])).toBe(true);
  });

  it("builds when config or dependencies change", () => {
    for (const f of ["next.config.ts", "package.json", "package-lock.json", "tsconfig.json", "vercel.json", "postcss.config.mjs", "scripts/vercel-ignore.mjs"]) {
      expect(shouldBuild([f]), f).toBe(true);
    }
  });

  it("builds when a pipeline file the app imports changes", () => {
    for (const f of APP_IMPORTED_FILES) expect(shouldBuild(["supabase/APPLIED.md", f]), f).toBe(true);
  });

  it("builds files it doesn't recognise, and builds when it can't tell what changed", () => {
    expect(shouldBuild(["proxy.ts"])).toBe(true);
    expect(shouldBuild(["instrumentation.ts"])).toBe(true);
    expect(shouldBuild([])).toBe(true);
  });
});

describe("vercel.json", () => {
  it("runs the script as the Ignored Build Step", () => {
    const config = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
    expect(config.ignoreCommand).toBe("node scripts/vercel-ignore.mjs");
  });
});

// Every file the app imports from outside app/, components/ and lib/ must be listed, or a change
// to it would skip the deploy that ships it.
describe("APP_IMPORTED_FILES", () => {
  function* walk(dir: string): Generator<string> {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) yield* walk(p);
      else if (/\.(ts|tsx|js|mjs)$/.test(e.name)) yield p;
    }
  }

  it("lists every file app code imports from pipeline/ (or anywhere else the skip rule covers)", () => {
    const imported = new Set<string>();
    for (const dir of ["app", "components", "lib"]) {
      for (const file of walk(join(root, dir))) {
        const src = readFileSync(file, "utf8");
        for (const m of src.matchAll(/from\s+["']((?:@\/|\.\.?\/)[^"']+)["']/g)) {
          const spec = m[1];
          const abs = spec.startsWith("@/") ? join(root, spec.slice(2)) : resolve(dirname(file), spec);
          const rel = relative(root, abs).replace(/\\/g, "/");
          if (/^(app|components|lib)\//.test(rel)) continue;
          imported.add(/\.\w+$/.test(rel) ? rel : `${rel}.ts`);
        }
      }
    }
    expect([...imported].sort()).toEqual([...APP_IMPORTED_FILES].sort());
  });
});
