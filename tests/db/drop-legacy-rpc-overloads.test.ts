/**
 * Migration 083 (gurmukhi-search#15): search 007 re-added the pre-006 single-value signatures of
 * search_lines_regex, search_first_letters and search_lines_by_word_ids (p_raag, p_writer) as thin
 * wrappers so the deployed shell kept working mid-rollout. Every client now sends the array
 * parameters, so only those versions remain.
 */
import { describe, it, expect } from "vitest";
import { applyFrom, freshDb } from "./replay";

const M = "083_drop_legacy_rpc_overloads.sql";

type Db = Awaited<ReturnType<typeof freshDb>>;
const signatures = async (db: Db) =>
  (await db.query<{ sig: string }>(
    `select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('search_lines_regex', 'search_first_letters', 'search_lines_by_word_ids')
      order by 1`,
  )).rows.map((r) => r.sig);

describe(M, () => {
  it("drops the three single-value overloads and keeps the array versions", async () => {
    const db = await freshDb({ before: M });
    expect(await signatures(db)).toHaveLength(6);
    await applyFrom(db, M);
    expect(await signatures(db)).toEqual([
      "search_first_letters(text[],text[],text[],bigint[],integer,integer,integer,integer)",
      "search_lines_by_word_ids(bigint[],text[],text[],bigint[],integer,integer,integer,integer)",
      "search_lines_regex(text,text[],text[],bigint[],integer,integer,integer,integer)",
    ]);
  });

  it("still answers calls by name, as PostgREST makes them", async () => {
    const db = await freshDb({ before: M });
    await applyFrom(db, M);
    await expect(db.query("select * from search_first_letters(p_letters => array['ਸ'], p_raags => null, p_writers => null)")).resolves.toBeDefined();
    await expect(db.query("select * from search_lines_regex(p_regex => 'ਸਤਿ')")).resolves.toBeDefined();
  });
});
