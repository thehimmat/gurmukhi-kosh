/**
 * Migration 081 (#162): lines.source_id was 'G', BaniDB's letter for Guru Granth Sahib, on every
 * line of every scripture (a column default, never set by an ingest), so it claimed a provenance
 * Sri Sarbloh, Gur Sobha and the others don't have. Nothing reads it; the scripture is source_fk.
 */
import { describe, it, expect } from "vitest";
import { applyFrom, freshDb } from "./replay";

const M = "081_drop_lines_source_id.sql";

// Production's initial_schema (2026-05-21) created the column; 001_schema.sql as it stands today
// doesn't, so the replay adds it back as production has it.
async function asProduction() {
  const db = await freshDb({ before: M });
  await db.exec("alter table public.lines add column source_id text not null default 'G'");
  return db;
}

const columns = async (d: Awaited<ReturnType<typeof freshDb>>) =>
  (await d.query<{ column_name: string }>(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'lines'",
  )).rows.map((r) => r.column_name);

describe(M, () => {
  it("drops lines.source_id and keeps source_fk", async () => {
    const db = await asProduction();
    expect(await columns(db)).toContain("source_id");
    await applyFrom(db, M);
    const after = await columns(db);
    expect(after).not.toContain("source_id");
    expect(after).toContain("source_fk");
  });

  it("is a no-op where the column never existed (the replay's own schema)", async () => {
    const db = await freshDb({ before: M });
    await expect(applyFrom(db, M)).resolves.toBeUndefined();
  });

  it("leaves list_writers, which reports source_fk as source_ids, working", async () => {
    const db = await asProduction();
    await applyFrom(db, M);
    await expect(db.query("select * from list_writers()")).resolves.toBeDefined();
  });
});
