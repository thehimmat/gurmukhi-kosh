/**
 * Migration 081 (#162): lines.source_id was 'G', BaniDB's letter for Guru Granth Sahib, on every
 * line of every scripture (a column default, never set by an ingest), so it claimed a provenance
 * Sri Sarbloh, Gur Sobha and the others don't have. Nothing reads it; the scripture is source_fk.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { applyFrom, freshDb } from "./replay";

const M = "081_drop_lines_source_id.sql";

const columns = async (d: PGlite) =>
  (await d.query<{ column_name: string }>(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'lines'",
  )).rows.map((r) => r.column_name);

// Production's initial_schema (2026-05-21) created the column; 001_schema.sql as it stands today
// doesn't, so the replay adds it back as production has it. The databases are built here, not in
// the tests: a replay takes longer than a test's 5 s timeout on a busy runner.
let prod: PGlite;
let before: string[];
let replayOwn: PGlite;
beforeAll(async () => {
  prod = await freshDb({ before: M });
  await prod.exec("alter table public.lines add column source_id text not null default 'G'");
  before = await columns(prod);
  await applyFrom(prod, M);
  replayOwn = await freshDb({ before: M });
}, 120_000);

describe(M, () => {
  it("drops lines.source_id and keeps source_fk", async () => {
    expect(before).toContain("source_id");
    const after = await columns(prod);
    expect(after).not.toContain("source_id");
    expect(after).toContain("source_fk");
  });

  it("is a no-op where the column never existed (the replay's own schema)", async () => {
    await expect(applyFrom(replayOwn, M)).resolves.toBeUndefined();
  });

  it("leaves list_writers, which reports source_fk as source_ids, working", async () => {
    await expect(prod.query("select * from list_writers()")).resolves.toBeDefined();
  });
});
