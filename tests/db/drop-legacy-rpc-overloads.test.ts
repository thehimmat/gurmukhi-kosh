/**
 * Migration 083 (gurmukhi-search#15): search 007 re-added the pre-006 single-value signatures of
 * search_lines_regex, search_first_letters and search_lines_by_word_ids (p_raag, p_writer) as thin
 * wrappers so the deployed shell kept working mid-rollout. Every client now sends the array
 * parameters, so only those versions remain.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { applyFrom, freshDb } from "./replay";

const M = "083_drop_legacy_rpc_overloads.sql";

const signatures = async (db: PGlite) =>
  (await db.query<{ sig: string }>(
    `select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('search_lines_regex', 'search_first_letters', 'search_lines_by_word_ids')
      order by 1`,
  )).rows.map((r) => r.sig);

// Built here, not in the tests: a replay takes longer than a test's 5 s timeout on a busy runner.
let db: PGlite;
let before: string[];
beforeAll(async () => {
  db = await freshDb({ before: M });
  before = await signatures(db);
  await applyFrom(db, M);
}, 120_000);

describe(M, () => {
  it("drops the three single-value overloads and keeps the array versions", async () => {
    expect(before).toHaveLength(6);
    expect(await signatures(db)).toEqual([
      "search_first_letters(text[],text[],text[],bigint[],integer,integer,integer,integer)",
      "search_lines_by_word_ids(bigint[],text[],text[],bigint[],integer,integer,integer,integer)",
      "search_lines_regex(text,text[],text[],bigint[],integer,integer,integer,integer)",
    ]);
  });

  it("still answers calls by name, as PostgREST makes them", async () => {
    await expect(db.query("select * from search_first_letters(p_letters => array['ਸ'], p_raags => null, p_writers => null)")).resolves.toBeDefined();
    await expect(db.query("select * from search_lines_regex(p_regex => 'ਸਤਿ')")).resolves.toBeDefined();
  });
});
