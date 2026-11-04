/**
 * Migration 082 (#194): refresh_word_frequencies() and refresh_word_corpus_stats() are SECURITY
 * DEFINER full-table rebuilds with a 900 s statement timeout, and anon could call them through
 * /rest/v1/rpc with the key every page ships. Now only service_role (the ingest) can, as 080 did
 * for refresh_health_stats. health_stats() stays public: /api/health reads it and, since 075, it
 * only reads the cached totals.
 */
import { describe, it, expect } from "vitest";
import { applyFrom, freshDb } from "./replay";

const M = "082_revoke_refresh_execute.sql";
const REVOKED = ["refresh_word_frequencies()", "refresh_word_corpus_stats()"];

type Db = Awaited<ReturnType<typeof freshDb>>;
const canExecute = async (db: Db, role: string, fn: string) =>
  (await db.query<{ ok: boolean }>(`select has_function_privilege('${role}', '${fn}'::regprocedure, 'execute') as ok`)).rows[0].ok;

describe(M, () => {
  it.each(REVOKED)("takes %s away from anon and authenticated, and leaves it to service_role", async (fn) => {
    const db = await freshDb({ before: M });
    expect(await canExecute(db, "anon", fn)).toBe(true);
    await applyFrom(db, M);
    expect(await canExecute(db, "anon", fn)).toBe(false);
    expect(await canExecute(db, "authenticated", fn)).toBe(false);
    expect(await canExecute(db, "service_role", fn)).toBe(true);
  });

  it("keeps health_stats() and the search RPCs callable by anon", async () => {
    const db = await freshDb({ before: M });
    await applyFrom(db, M);
    expect(await canExecute(db, "anon", "health_stats()")).toBe(true);
    expect(await canExecute(db, "anon", "search_lines_contains(text, text[], text[], bigint[], integer, integer, integer, integer)")).toBe(true);
  });
});
