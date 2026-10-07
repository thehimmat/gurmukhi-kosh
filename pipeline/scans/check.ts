/**
 * Cross-reference sample lines from a scan section against BaniDB.
 *
 * Reads Unicode Gurmukhi lines (one per line) on stdin and prints the
 * section's match status, dominant BaniDB source, shabad ids, per-line
 * scores and variant readings as JSON.
 *
 * Usage: npm run scans:check < lines.txt
 */

import { crossReferenceSection } from "./crossref";

async function main() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const lines = input.split("\n").map((l) => l.trim()).filter(Boolean);
  const r = await crossReferenceSection(lines);
  console.log(
    JSON.stringify(
      {
        status: r.status,
        sourceId: r.sourceId,
        shabadIds: r.shabadIds,
        lines: r.lines.map((l) => ({
          scan: l.scan,
          similarity: Number(l.similarity.toFixed(2)),
          banidb: l.best && { source: l.best.sourceId, shabadId: l.best.shabadId, verseId: l.best.verseId, ang: l.best.pageNo, text: l.best.unicode },
        })),
        variants: r.variants.length,
      },
      null,
      1,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
