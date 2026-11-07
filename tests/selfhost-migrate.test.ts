/**
 * Applying a migration from GitHub Actions (.github/workflows/migrate.yml): the workflow sends a
 * migration's file name over SSH to selfhost/scripts/migrate.sh, the forced command of its own key,
 * which applies that file from main in one transaction. The script is the security boundary, so it
 * takes a file name and nothing else. Run: npm test
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(root, "selfhost/scripts/migrate.sh");

// Against this checkout (HEAD, no fetch), stopping before psql.
function run(arg: string): { status: number; out: string } {
  try {
    const out = execFileSync("sh", [script], {
      env: { ...process.env, SSH_ORIGINAL_COMMAND: arg, KOSH_MIGRATE_REF: "HEAD", KOSH_MIGRATE_NO_FETCH: "1", KOSH_MIGRATE_DRY_RUN: "1" },
      encoding: "utf8",
      stdio: "pipe",
    });
    return { status: 0, out };
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string };
    return { status: err.status, out: `${err.stdout}${err.stderr}` };
  }
}

describe("selfhost/scripts/migrate.sh", () => {
  it("refuses anything but a migration file name (it's the migrate key's forced command)", () => {
    for (const arg of ["", "086_padarth_commentary", "86_x.sql", "086_X.sql", "086_x.sql; rm -rf /", "../086_x.sql", "086_a b.sql", "086_x.sql\nselect 1"]) {
      expect(run(arg).status, `arg ${JSON.stringify(arg)}`).toBe(2);
    }
  });

  it("refuses a migration that isn't on main", () => {
    const r = run("999_not_a_migration.sql");
    expect(r.status).toBe(3);
    expect(r.out).toMatch(/not in supabase\/migrations/);
  });

  it("refuses one APPLIED.md already records, so nothing runs twice", () => {
    const r = run("086_padarth_commentary.sql");
    expect(r.status).toBe(4);
    expect(r.out).toMatch(/already applied/);
  });
});

describe(".github/workflows/migrate.yml", () => {
  const wf = readFileSync(join(root, ".github/workflows/migrate.yml"), "utf8");

  it("runs only by hand, from main, one at a time with deploys", () => {
    expect(wf).toMatch(/^on:\n\s+workflow_dispatch:/m);
    expect(wf).not.toMatch(/^\s+(push|pull_request|workflow_run|schedule):/m);
    expect(wf).toContain("github.ref == 'refs/heads/main'");
    expect(wf).toMatch(/concurrency:\n\s+group: deploy/);
  });

  it("never pastes the input into a shell script, only passes it through the environment", () => {
    const runBlocks = wf.split(/\n\s+run: \|/).slice(1);
    for (const block of runBlocks) expect(block.split(/\n\s+- /)[0]).not.toContain("${{");
    expect(wf).toContain("MIGRATION: ${{ inputs.migration }}");
  });

  it("uses its own key, not the deploy key", () => {
    expect(wf).toContain("secrets.MIGRATE_SSH_KEY");
    expect(wf).not.toContain("secrets.DEPLOY_SSH_KEY");
  });
});
