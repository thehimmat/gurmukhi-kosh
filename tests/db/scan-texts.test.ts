/**
 * Migration 093: the curator's scan viewer (scan-text-layer output: page transcriptions and
 * translation units). Curator-only: the API roles (anon, authenticated) can neither read nor write
 * any of it; service_role (the curator) can. Deleting a text removes everything under it.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb } from "./replay";

const TABLES = ["scan_texts", "scan_pages", "scan_lines", "scan_units", "scan_unit_lines"];

async function seed(db: PGlite) {
  await db.exec(`
    insert into scan_texts (slug, title) values ('garab-ganjani-teeka', 'Garab Ganjani Teeka');
    insert into scan_pages (text_slug, page, image_path, width, height)
      values ('garab-ganjani-teeka', 9, 'garab-ganjani-teeka/0009.webp', 1200, 1800);
    insert into scan_lines (text_slug, page, n, type, text)
      values ('garab-ganjani-teeka', 9, 1, 'heading', 'ੴ ਸਤਿਗੁਰ ਪ੍ਰਸਾਦਿ॥');
    insert into scan_units (text_slug, seq, label, pages, source, translation)
      values ('garab-ganjani-teeka', 1, 'opening', '{9}', 'ੴ ਸਤਿਗੁਰ ਪ੍ਰਸਾਦਿ॥', 'Ik Oankar');
    insert into scan_unit_lines (text_slug, seq, page, n) values ('garab-ganjani-teeka', 1, 9, 1);
  `);
}

let db: PGlite;
beforeAll(async () => {
  db = await freshDb();
  await seed(db);
}, 120_000);

describe("093 scan texts", () => {
  it("registers the scan-text-layer source as curator-only", async () => {
    const { rows } = await db.query<{ visibility: string }>(
      "select visibility from source_rights where code = 'scan_text_layer'",
    );
    expect(rows).toEqual([{ visibility: "curator" }]);
  });

  for (const role of ["anon", "authenticated"]) {
    it(`hides every table from ${role}`, async () => {
      await db.exec(`set role ${role}`);
      try {
        for (const t of TABLES) {
          await expect(db.query(`select * from ${t}`)).rejects.toThrow(/permission denied/);
        }
        await expect(
          db.exec("insert into scan_texts (slug, title) values ('x', 'x')"),
        ).rejects.toThrow(/permission denied/);
      } finally {
        await db.exec("reset role");
      }
    });
  }

  it("lets service_role read everything", async () => {
    await db.exec("set role service_role");
    try {
      for (const t of TABLES) {
        const { rows } = await db.query(`select * from ${t}`);
        expect(rows.length, t).toBe(1);
      }
    } finally {
      await db.exec("reset role");
    }
  });

  it("rejects an unknown line type and a unit line that is not a line", async () => {
    await expect(
      db.exec("insert into scan_lines (text_slug, page, n, type, text) values ('garab-ganjani-teeka', 9, 2, 'bogus', 'x')"),
    ).rejects.toThrow();
    await expect(
      db.exec("insert into scan_unit_lines (text_slug, seq, page, n) values ('garab-ganjani-teeka', 1, 9, 99)"),
    ).rejects.toThrow();
  });

  it("removes a text's pages, lines, units and links with the text", async () => {
    const fresh = await freshDb();
    await seed(fresh);
    await fresh.exec("delete from scan_texts where slug = 'garab-ganjani-teeka'");
    for (const t of TABLES) {
      const { rows } = await fresh.query<{ n: number }>(`select count(*)::int as n from ${t}`);
      expect(rows[0].n, t).toBe(0);
    }
  });
});
