/**
 * The Mahan Kosh collation staging tables (#253): three migrations applied to production on
 * 2026-10-19 with no repo file, now filed under supabase/migrations-imported/unfiled/ and replayed
 * before 065, so the replay matches production again.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb } from "./replay";

const MK = ["mk_alignments", "mk_discrepancies", "mk_pa_entries", "mk_runs", "mk_secrets"];

// Built here, not in the tests: a replay takes longer than a test's 5 s timeout on a busy runner.
let db: PGlite;
beforeAll(async () => {
  db = await freshDb();
}, 120_000);

describe("mk_* staging (unfiled 2026-10-19)", () => {
  it("creates the staging tables with RLS on and no policies, so the API can't read them", async () => {
    const { rows } = await db.query<{ relname: string; rls: boolean; policies: number }>(
      `select c.relname, c.relrowsecurity as rls,
              (select count(*)::int from pg_policies p where p.tablename = c.relname) as policies
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'mk\\_%' order by 1`,
    );
    expect(rows.map((r) => r.relname)).toEqual(MK);
    expect(rows.every((r) => r.rls && r.policies === 0)).toBe(true);
  });

  it("leaves mk_ingest executable by no API role, as the second migration made it", async () => {
    for (const role of ["anon", "authenticated"]) {
      const { rows } = await db.query<{ ok: boolean }>(
        `select has_function_privilege('${role}', 'mk_ingest(text, text, jsonb)'::regprocedure, 'execute') as ok`,
      );
      expect(rows[0].ok).toBe(false);
    }
  });
});
