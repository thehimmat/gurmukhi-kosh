import { describe, it, expect } from "vitest";
import { shabadWriters, shabadUpsertRow } from "../pipeline/sggs/shabad-meta";
import type { BaniDBVerse } from "../lib/banidb";

// Only the fields the helpers read matter.
function verse(shabadId: number, writer: Partial<BaniDBVerse["writer"]> | null, pageNo = 1): BaniDBVerse {
  return { shabadId, pageNo, writer, raag: {} } as unknown as BaniDBVerse;
}

describe("shabadWriters (#86)", () => {
  it("takes the first verse that actually names a writer, not simply the first verse", () => {
    const m = shabadWriters([
      verse(10, null),
      verse(10, { writerId: 3, english: "Guru Amar Daas Ji" }),
      verse(10, { writerId: 4, english: "Guru Raam Daas Ji" }),
    ]);
    expect(m.get(10)).toEqual({ writerId: 3, english: "Guru Amar Daas Ji" });
  });

  it("treats a blank or id-less writer as missing", () => {
    const m = shabadWriters([
      verse(11, { writerId: 0, english: "" }),
      verse(11, { english: "  " } as BaniDBVerse["writer"]),
    ]);
    expect(m.has(11)).toBe(false);
  });

  it("keeps shabads separate", () => {
    const m = shabadWriters([
      verse(1, { writerId: 1, english: "Guru Nanak Dev Ji" }),
      verse(2, { writerId: 5, english: "Guru Arjan Dev Ji" }),
    ]);
    expect(m.get(1)?.english).toBe("Guru Nanak Dev Ji");
    expect(m.get(2)?.english).toBe("Guru Arjan Dev Ji");
  });
});

describe("shabadUpsertRow (#86)", () => {
  it("omits writer and raag columns the verse lacks, so an upsert never nulls a known value", () => {
    const row = shabadUpsertRow(verse(7, null, 12));
    expect(row).toEqual({ id: 7, ang_start: 12 });
  });

  it("includes the writer when the verse names one", () => {
    const row = shabadUpsertRow(verse(7, { writerId: 5, english: "Guru Arjan Dev Ji" }, 12));
    expect(row).toMatchObject({ writer_english: "Guru Arjan Dev Ji", writer_id: 5 });
  });
});
