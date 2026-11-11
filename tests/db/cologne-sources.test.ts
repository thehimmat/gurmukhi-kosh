/**
 * Migration 091: the rest of the Cologne (csl-orig) dictionaries in plan Phase 1 (#249), registered
 * as MW was in 090: curator-only, CC BY-SA 4.0 (#273). Edgerton (1953) and Apte (1957) are later
 * printed texts, so their rights are pending rather than open.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb } from "./replay";
import { COLOGNE_CODES } from "../../pipeline/cologne/codes";

let db: PGlite;
beforeAll(async () => {
  db = await freshDb();
}, 120_000);

describe("091: the other Cologne dictionaries", () => {
  it("registers every csl-orig dictionary the loader knows, as a curator-only Sanskrit source", async () => {
    const { rows } = await db.query<{ code: string; language: string; visibility: string; licence: string }>(
      `select d.code, d.language, r.visibility, r.licence
         from dict_sources d join source_rights r on r.code = d.code where d.code like 'cologne\\_%' order by 1`,
    );
    expect(rows.map((r) => r.code)).toEqual(Object.values(COLOGNE_CODES).sort());
    for (const r of rows) expect([r.language, r.visibility, r.licence]).toEqual(["sa", "curator", "CC BY-SA 4.0"]);
  });

  it("marks only the twentieth-century printed texts as pending", async () => {
    const { rows } = await db.query<{ code: string }>(
      `select code from source_rights where code like 'cologne\\_%' and rights_status = 'pending' order by 1`,
    );
    expect(rows.map((r) => r.code)).toEqual(["cologne_ap", "cologne_bhs"]);
  });
});
