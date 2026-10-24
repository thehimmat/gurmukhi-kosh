/**
 * Prints every migration file, repo-relative, in the order production applied them (the same order
 * tests/db/replay.ts replays into PGlite), one per line, for psql to run in turn:
 *
 *   npx tsx scripts/self-host/replay-order.ts | while read f; do psql -f "$f"; done
 *
 * tests/db/sggs-source.sql follows 001_schema.sql, where production's UNFILED add_sources_table seeded
 * the SGGS source row. The PGlite bootstrap is not printed: scripts/self-host/bootstrap.sql replaces it.
 */
import { replayOrder } from "../../tests/db/replay";

for (const f of replayOrder()) {
  console.log(f);
  if (f.endsWith("/001_schema.sql")) console.log("tests/db/sggs-source.sql");
}
