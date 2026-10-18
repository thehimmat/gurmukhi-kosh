import { describe, it, expect } from "vitest";
import { linesLoadSql } from "../pipeline/shared/load-sql";

const lines = [
  { verse_id: 1, ang: 1, line_no: 1, shabad_id: 910001, gurmukhi: "ਹਵਾਏ ਬੰਦਗੀ ਆਵੁਰਦ ।" },
  { verse_id: 2, ang: 1, line_no: 2, shabad_id: 910001, gurmukhi: "ਦਰ ਵਜੂਦ ਮਰਾ ਦਰ ॥੧॥" },
];

describe("linesLoadSql", () => {
  const { sql, tokens, distinct } = linesLoadSql("nand_lal_ghazals", lines);

  it("counts tokens as lib/tokenizer does (dandas and sher numbers are not words)", () => {
    expect(tokens).toBe(7);
    expect(distinct).toBe(6);
  });

  it("scopes every row to the source by code", () => {
    expect(sql.match(/where code = 'nand_lal_ghazals'/g)?.length).toBe(2);
    expect(sql).toContain("(1, 910001, 1, 1, 'ਹਵਾਏ ਬੰਦਗੀ ਆਵੁਰਦ ।')");
  });

  it("gives each occurrence its 0-based position in the line", () => {
    expect(sql).toContain("(2, 0, 'ਦਰ')");
    expect(sql).toContain("(2, 3, 'ਦਰ')");
  });

  it("escapes quotes", () => {
    const { sql: q } = linesLoadSql("x", [{ ...lines[0], gurmukhi: "ਅ'ਬ" }]);
    expect(q).toContain("'ਅ''ਬ'");
  });

  it("counts words from a source's own word text when given one, keeping the stored line as is", () => {
    const strip = (t: string) => t.replace(/,/g, " ");
    const { sql: q, tokens } = linesLoadSql("x", [{ ...lines[0], gurmukhi: "ਹਵਾਏ, ਬੰਦਗੀ ।" }], strip);
    expect(tokens).toBe(2);
    expect(q).toContain("'ਹਵਾਏ, ਬੰਦਗੀ ।'");
    expect(q).toContain("(1, 0, 'ਹਵਾਏ')");
  });
});
