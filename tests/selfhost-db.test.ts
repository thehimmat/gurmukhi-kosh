/**
 * The VM's Postgres (selfhost/docker-compose.yml). With shared_buffers at 3 GB the whole database
 * stays in memory, except just after a restart, when the first searches read lines from disk and
 * can pass anon's 3 s statement timeout (gurmukhi-search#50). pg_prewarm's autoprewarm worker
 * records which blocks are cached and loads them back when Postgres starts.
 * Run: npm test
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const compose = readFileSync(join(root, "selfhost/docker-compose.yml"), "utf8");
const dbCommand = compose.match(/^ {4}command: (\[.*\])$/m)?.[1] ?? "";

describe("selfhost Postgres", () => {
  it("preloads pg_prewarm, so the cache is reloaded after a restart", () => {
    expect(dbCommand).toContain('"shared_preload_libraries=pg_prewarm"');
  });

  it("keeps the memory settings configurable from selfhost/.env", () => {
    expect(dbCommand).toContain("shared_buffers=${PG_SHARED_BUFFERS:-256MB}");
    expect(dbCommand).toContain("effective_cache_size=${PG_EFFECTIVE_CACHE_SIZE:-1GB}");
  });

  // kosh-db is 2 OCPU / 12 GB, the Always Free A1 allowance (thehimmat/atthebunga-server#4).
  it("sizes a new server's .env for the 12 GB VM", () => {
    const setup = readFileSync(join(root, "selfhost/scripts/db-setup.sh"), "utf8");
    expect(setup).toContain('echo "PG_SHARED_BUFFERS=3GB"');
    expect(setup).toContain('echo "PG_EFFECTIVE_CACHE_SIZE=6GB"');
  });
});
