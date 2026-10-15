/**
 * search_first_letters as the site calls it: anon key, 3s statement timeout.
 *
 * Before 044 every query of two or more letters timed out ("canceling
 * statement due to statement timeout"); 044 answers it from the indexed
 * lines.first_letters prefix instead. Live DB, like tests/api.test.ts.
 */
import { describe, it, expect } from "vitest";
import { anonDb } from "./stories/helpers";
import { tokenize } from "../lib/tokenizer";

type Row = { id: number; gurmukhi: string; total_count: number; writer_english: string | null };

async function firstLetters(letters: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await anonDb().rpc("search_first_letters", {
    p_letters: [...letters],
    p_limit: 20,
    p_offset: 0,
    ...extra,
  });
  return { rows: (data ?? []) as Row[], error };
}

const live = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

describe.skipIf(!live)("search_first_letters (anon)", () => {
  it("answers multi-letter queries within the anon timeout", async () => {
    const t0 = Date.now();
    const { rows, error } = await firstLetters("ਸਨਕਪ");
    expect(error).toBeNull();
    expect(Date.now() - t0).toBeLessThan(3000);
    // 8 lines, counted with the pre-044 function (verified identical before applying)
    expect(rows[0].total_count).toBe(8);
  });

  it("finds the Mool Mantar from its first letters", async () => {
    const { rows, error } = await firstLetters("ੴਸਨਕਪ");
    expect(error).toBeNull();
    expect(rows.map((r) => r.id)).toContain(1);
  });

  it("returns only lines whose words start with the letters, in order", async () => {
    const letters = "ਮਨਮ";
    const { rows, error } = await firstLetters(letters);
    expect(error).toBeNull();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const words = tokenize(r.gurmukhi);
      [...letters].forEach((l, i) => expect(words[i]?.startsWith(l), `${r.gurmukhi} @${i}`).toBe(true));
    }
  });

  it("treats _ as any letter", async () => {
    const { rows, error } = await firstLetters("ਸ_ਕ");
    expect(error).toBeNull();
    expect(rows[0].total_count).toBe(2292);
  });

  it("still applies the writer filter", async () => {
    const { rows, error } = await firstLetters("ਸਨ", { p_writers: ["Guru Nanak Dev Ji"] });
    expect(error).toBeNull();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.writer_english).toBe("Guru Nanak Dev Ji");
  });

  it("returns nothing for letters no line starts with", async () => {
    const { rows, error } = await firstLetters("ਜਸਹਪਨ");
    expect(error).toBeNull();
    expect(rows).toEqual([]);
  });

  // 051: a vowel carrier stands for every independent vowel it carries, as ਸ
  // stands for ਸਿ ਸੀ ਸੇ. Counts are whole-corpus line counts taken live.
  it.each([
    ["ੲ", 4870],
    ["ਇ", 4870],
    ["ਏ", 4870],
    ["ੳ", 2085],
    ["ਅ", 13644],
    ["ਆ", 13644],
    ["ੲਕ", 339],
  ])("folds the vowel carrier for %s", async (letters, total) => {
    const { rows, error } = await firstLetters(letters);
    expect(error).toBeNull();
    expect(rows[0].total_count).toBe(total);
  });

  it("returns lines whose first word starts with any vowel ੲ carries", async () => {
    const { rows, error } = await firstLetters("ੲ");
    expect(error).toBeNull();
    for (const r of rows) expect(tokenize(r.gurmukhi)[0]).toMatch(/^[ਇਈਏੲ]/);
  });
});

describe.skipIf(!live)("search_first_letters_fuzzy (anon)", () => {
  it("folds vowel carriers too", async () => {
    const { data, error } = await anonDb().rpc("search_first_letters_fuzzy", {
      p_letters: ["ੲ", "ਕ"],
      p_level: 1,
      p_limit: 20,
      p_offset: 0,
    });
    expect(error).toBeNull();
    const rows = (data ?? []) as Row[];
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(tokenize(r.gurmukhi)[0]).toMatch(/^[ਇਈਏੲ]/);
  });
});
