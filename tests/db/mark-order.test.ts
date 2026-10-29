/**
 * Migration 079 (#310): nasal marks BaniDB stores before the aunkar or dulainkar, put in Unicode order in
 * every corpus loaded (pipeline/sggs/mark-order.ts), and ਤੈ → ਤੈਂ in Dasam 130267 (FOLLOW_UPS). Same steps
 * as 073-077, across sources.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { applyFrom, freshDb } from "./replay";
import { linesLoadSql } from "../../pipeline/shared/load-sql";
import { foldGurmukhi } from "../../lib/gurmukhi-fold";
import { FOLLOW_UPS } from "../../pipeline/sggs/corrections";
import { fixMarkOrder } from "../../pipeline/sggs/mark-order";

const M = "079_mark_order.sql";
const line = (verse_id: number, gurmukhi: string) => ({ verse_id, ang: 1, line_no: verse_id, shabad_id: null, gurmukhi });

let db: PGlite;
beforeAll(async () => {
  db = await freshDb({ before: M });
  await db.exec(linesLoadSql("sggs_banidb_v2", [line(1, "ਗੁਰ ਪਰਸਾਦਿ ਨੂੰ ਜਾਣੈ ॥")]).sql);
  await db.exec(linesLoadSql("dasam_banidb_v2", [
    line(80110, "ਦੇਖਣ ਚੰਡ ਪ੍ਰਚੰਡ ਨੰੂ ਰਣ ਘੁਰੇ ਨਗਾਰੇ ॥"),
    line(130267, FOLLOW_UPS[0].from),
  ]).sql);
  await db.exec(linesLoadSql("bhai_gurdas_banidb_v2", [line(201379, "ਸਾਇਰ ਸਤ ਸਮੰੁਦ੍ਰ ਵਿਚਿ ਰਤਨ ਅਮੋਲ ਕਿਨੇਹੀ ॥")]).sql);
  await db.exec(`
    update lines set transliteration_en = case verse_id
      when 80110 then 'dhekhan cha(n)dd pracha(n)dd na(n)oo ran ghure nagaare ||'
      when 130267 then '${FOLLOW_UPS[0].translitFrom.replaceAll("'", "''")}'
      when 201379 then 'saair sat sama(n)udhr vich ratan amol kinehee ||' end
    where verse_id in (80110, 130267, 201379);
    update words w set frequency = (select count(*) from word_occurrences o where o.word_id = w.id);
  `);
  await applyFrom(db, M);
}, 60_000);

const q = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const word = async (g: string) =>
  (await q<{ f: number; s: string | null }>("select frequency f, search_fold s from words where gurmukhi = $1", [g]))[0];

describe("079: nasal marks in Unicode order, and ਤੈਂ in 130267", () => {
  it("reorders the marks in every corpus, transliteration included", async () => {
    const rows = await q<{ v: number; g: string; t: string }>(
      "select verse_id v, gurmukhi g, transliteration_en t from lines where verse_id in (80110, 201379) order by verse_id");
    expect(rows).toEqual([
      { v: 80110, g: "ਦੇਖਣ ਚੰਡ ਪ੍ਰਚੰਡ ਨੂੰ ਰਣ ਘੁਰੇ ਨਗਾਰੇ ॥", t: "dhekhan cha(n)dd pracha(n)dd noo(n) ran ghure nagaare ||" },
      { v: 201379, g: "ਸਾਇਰ ਸਤ ਸਮੁੰਦ੍ਰ ਵਿਚਿ ਰਤਨ ਅਮੋਲ ਕਿਨੇਹੀ ॥", t: "saair sat samu(n)dhr vich ratan amol kinehee ||" },
    ]);
    // The same as the ingest's rule.
    const ingest = fixMarkOrder("ਸਾਇਰ ਸਤ ਸਮੰੁਦ੍ਰ ਵਿਚਿ ਰਤਨ ਅਮੋਲ ਕਿਨੇਹੀ ॥", "saair sat sama(n)udhr vich ratan amol kinehee ||");
    expect({ v: 201379, g: ingest.gurmukhi, t: ingest.transliteration }).toEqual(rows[1]);
  });

  it("applies the ਤੈਂ follow-up", async () => {
    const [r] = await q<{ g: string; t: string }>("select gurmukhi g, transliteration_en t from lines where verse_id = 130267");
    expect(r).toEqual({ g: FOLLOW_UPS[0].to, t: FOLLOW_UPS[0].translitTo });
  });

  it("joins the misordered spelling to the existing word, and creates a new one with its search key", async () => {
    expect((await word("ਨੂੰ")).f).toBe(2);
    expect(await word("ਸਮੁੰਦ੍ਰ")).toEqual({ f: 1, s: foldGurmukhi("ਸਮੁੰਦ੍ਰ") });
    expect(await q("select gurmukhi from words where gurmukhi = any($1)", [["ਨੰੂ", "ਸਮੰੁਦ੍ਰ", "ਤੈ"]])).toEqual([]);
  });

  it("is safe to run again", async () => {
    await applyFrom(db, M);
    expect((await word("ਨੂੰ")).f).toBe(2);
  });
});
