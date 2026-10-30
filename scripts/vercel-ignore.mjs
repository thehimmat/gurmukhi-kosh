#!/usr/bin/env node
// Vercel's Ignored Build Step (vercel.json "ignoreCommand"). Exit 0 skips the deployment, exit 1
// builds it. A push that only touches migrations, pipelines, docs or tests can't
// change what the app serves, and every production deployment starts with an empty ISR cache, so
// deploying those merges only made crawlers re-render pages (the Oct 2026 Hobby overage). When in
// doubt it builds: an unknown path, an empty diff or a git error all deploy.

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Files outside app/, components/ and lib/ that the app imports (tests/vercel-ignore.test.ts keeps this in step). */
export const APP_IMPORTED_FILES = ["pipeline/mahan-kosh/abbreviations.json", "pipeline/shared/health-stats.ts"];

/** Paths that never reach the deployed app, unless listed in APP_IMPORTED_FILES. */
const NON_APP = [
  /^pipeline\//,
  /^supabase\//,
  /^selfhost\//,
  /^docs\//,
  /^tests\//,
  /^user-stories\//,
  /^\.github\//,
  /^scripts\/check-[^/]+\.mjs$/,
  /^[^/]+\.md$/,
  /^\.gitignore$/,
  /^env\.example$/,
  /^requirements\.txt$/,
  /^vitest\.config\.ts$/,
];

/** Whether a push changing these files (repo-relative paths) needs a deployment. */
export function shouldBuild(files) {
  if (files.length === 0) return true;
  return files.some((f) => APP_IMPORTED_FILES.includes(f) || !NON_APP.some((re) => re.test(f)));
}

function changedFiles(base) {
  const out = execFileSync("git", ["diff", "--name-only", base, "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return out.split("\n").filter(Boolean);
}

function main() {
  // The last deployed commit, so a run of skipped pushes is judged together; HEAD^ if Vercel
  // doesn't say or the shallow clone doesn't reach it.
  const bases = [process.env.VERCEL_GIT_PREVIOUS_SHA, "HEAD^"].filter(Boolean);
  for (const base of bases) {
    try {
      const files = changedFiles(base);
      if (shouldBuild(files)) {
        console.log(`Building: app files changed since ${base}.`);
        process.exit(1);
      }
      console.log(`Skipping: nothing the app serves changed since ${base} (${files.length} files).`);
      process.exit(0);
    } catch {
      // try the next base
    }
  }
  console.log("Building: couldn't diff against a previous commit.");
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
