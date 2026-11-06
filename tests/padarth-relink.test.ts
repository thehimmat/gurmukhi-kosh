/**
 * Ingests that delete and re-create pad-arth glosses or definitions end by reattaching the
 * curator's saved picks to the re-created rows (padarth_relink_refs, migration 084), and fail
 * loudly when that does not run: a silent failure would leave picks showing only their snapshot.
 */
import { describe, it, expect } from "vitest";
import { relinkPadarthPicks } from "../pipeline/shared/padarth-relink";

const fakeDb = (result: { data: unknown; error: { message: string } | null }, calls: string[] = []) => ({
  rpc(fn: string) {
    calls.push(fn);
    return Promise.resolve(result);
  },
});

describe("relinkPadarthPicks", () => {
  it("calls padarth_relink_refs and reports what it reattached and what is still unlinked", async () => {
    const calls: string[] = [];
    const counts = await relinkPadarthPicks(fakeDb({ data: [{ relinked: 3, unlinked: 1 }], error: null }, calls));
    expect(calls).toEqual(["padarth_relink_refs"]);
    expect(counts).toEqual({ relinked: 3, unlinked: 1 });
  });

  it("throws, naming the SQL to re-run, when the relink fails", async () => {
    await expect(relinkPadarthPicks(fakeDb({ data: null, error: { message: "permission denied" } }))).rejects.toThrow(
      /padarth_relink_refs failed: permission denied[^]*select \* from padarth_relink_refs\(\);/
    );
  });
});
