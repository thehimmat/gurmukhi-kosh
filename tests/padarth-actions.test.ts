import { describe, it, expect, vi, beforeEach } from "vitest";

// The builder's server actions: key-checked, input-checked, then one call each.
const calls: { op: string; args: unknown[] }[] = [];
const fakeDb = {
  rpc: (...args: unknown[]) => {
    calls.push({ op: "rpc", args });
    return Promise.resolve({ data: 41, error: null });
  },
  from: (table: string) => ({
    upsert: (...args: unknown[]) => {
      calls.push({ op: `upsert ${table}`, args });
      return Promise.resolve({ error: null });
    },
    delete: () => ({
      eq: (...args: unknown[]) => {
        calls.push({ op: `delete ${table}`, args });
        return Promise.resolve({ error: null });
      },
    }),
  }),
};
vi.mock("../lib/curator", async (orig) => ({
  ...(await orig<typeof import("../lib/curator")>()),
  curatorDb: () => fakeDb,
}));

beforeEach(() => {
  calls.length = 0;
  vi.stubEnv("ADMIN_KEY", "secret");
});

const good = { key: "secret", lineId: 9, positions: [4, 6], surface: "ਕੂੜੈ … ਪਾਲਿ", refs: [{ kind: "padarth_gloss" as const, id: 61 }], overrideText: null, noteText: "a note" };

describe("savePick", () => {
  it("saves through padarth_save_pick, as the curator", async () => {
    const { savePick } = await import("../app/admin/padarth/actions");
    expect(await savePick(good)).toEqual({ pickId: 41 });
    expect(calls).toEqual([
      {
        op: "rpc",
        args: [
          "padarth_save_pick",
          { p_line_id: 9, p_positions: [4, 6], p_surface: "ਕੂੜੈ … ਪਾਲਿ", p_override: null, p_note: "a note", p_refs: [{ kind: "padarth_gloss", id: 61 }], p_chosen_by: "curator" },
        ],
      },
    ]);
  });

  it.each([
    ["a wrong key", { key: "nope" }],
    ["no key", { key: undefined }],
    ["a non-integer line", { lineId: 9.5 }],
    ["unsorted positions", { positions: [6, 4] }],
    ["no positions", { positions: [] }],
    ["an unknown ref kind", { refs: [{ kind: "word_grammar", id: 1 }] }],
    ["a ref without an id", { refs: [{ kind: "definition", id: "1" }] }],
    ["an over-long override", { overrideText: "x".repeat(5001) }],
  ])("refuses %s without touching the database", async (_label, patch) => {
    const { savePick } = await import("../app/admin/padarth/actions");
    await expect(savePick({ ...good, ...(patch as object) } as typeof good)).rejects.toThrow();
    expect(calls).toEqual([]);
  });
});

describe("saveLineNote", () => {
  it("writes a note, and removes it when cleared", async () => {
    const { saveLineNote } = await import("../app/admin/padarth/actions");
    await saveLineNote({ key: "secret", lineId: 9, text: "  the strong bull of Dharam  " });
    await saveLineNote({ key: "secret", lineId: 9, text: "   " });
    expect(calls).toEqual([
      { op: "upsert padarth_line_notes", args: [{ line_id: 9, note_text: "the strong bull of Dharam", chosen_by: "curator" }, { onConflict: "line_id" }] },
      { op: "delete padarth_line_notes", args: ["line_id", 9] },
    ]);
  });

  it("refuses a wrong key", async () => {
    const { saveLineNote } = await import("../app/admin/padarth/actions");
    await expect(saveLineNote({ key: "nope", lineId: 9, text: "x" })).rejects.toThrow(/Unauthorized/);
    expect(calls).toEqual([]);
  });
});
