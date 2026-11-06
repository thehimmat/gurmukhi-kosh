/**
 * Reattaches the pad-arth builder's saved picks to re-created rows (padarth_relink_refs,
 * migration 084). Ingests delete and re-create padarth_glosses and definitions rows; deleting
 * one clears the row id on any pick ref that pointed at it, and this puts it back where an
 * unchanged row came back. So every ingest that replaces those rows ends with it.
 */

type RpcDb = {
  rpc(fn: "padarth_relink_refs"): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export async function relinkPadarthPicks(db: RpcDb): Promise<{ relinked: number; unlinked: number }> {
  const { data, error } = await db.rpc("padarth_relink_refs");
  if (error) {
    throw new Error(
      `padarth_relink_refs failed: ${error.message}\n` +
        "Saved pad-arth picks show their snapshot only until it runs. Re-run it directly (SQL: select * from padarth_relink_refs();)."
    );
  }
  const row = (Array.isArray(data) ? data[0] : data) as { relinked: number; unlinked: number };
  console.log(`Pad-arth picks: ${row.relinked} refs relinked, ${row.unlinked} still unlinked.`);
  return { relinked: row.relinked, unlinked: row.unlinked };
}
