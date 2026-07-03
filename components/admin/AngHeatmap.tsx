/**
 * Density strip of open-flag weight across all 1430 angs, bucketed into groups
 * of 10 for a readable width. Weight is occurrence-count-of-the-flagged-word,
 * not distinct-flag-count — the question this answers is "where will a reader
 * actually run into a flagged reading," not "how many words here are flagged."
 */

const BUCKET_SIZE = 10;
const TOTAL_ANGS = 1430;

function colorFor(ratio: number): string {
  // 0 -> parchment (no flags), 1 -> deep accent (max density).
  if (ratio <= 0) return "var(--bg-alt)";
  const lightness = 88 - ratio * 55; // 88% (barely tinted) down to ~33%
  return `hsl(28, 45%, ${lightness}%)`;
}

export function AngHeatmap({ data }: { data: { ang: number; weight: number }[] }) {
  const weightByAng = new Map(data.map((d) => [d.ang, d.weight]));

  const buckets: { start: number; end: number; total: number }[] = [];
  for (let start = 1; start <= TOTAL_ANGS; start += BUCKET_SIZE) {
    const end = Math.min(start + BUCKET_SIZE - 1, TOTAL_ANGS);
    let total = 0;
    for (let a = start; a <= end; a++) total += weightByAng.get(a) ?? 0;
    buckets.push({ start, end, total });
  }
  const max = Math.max(1, ...buckets.map((b) => b.total));

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <p style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "0.4rem" }}>
        Flag density by ang (darker = more likely to run into a flagged reading there)
      </p>
      <div style={{ display: "flex", width: "100%", height: "28px", borderRadius: "4px", overflow: "hidden", border: "1px solid var(--border)" }}>
        {buckets.map((b) => (
          <div
            key={b.start}
            title={`Ang ${b.start}${b.end !== b.start ? `–${b.end}` : ""}: ${b.total} flagged-occurrence${b.total === 1 ? "" : "s"}`}
            style={{ flex: 1, height: "100%", backgroundColor: colorFor(b.total / max) }}
          />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.2rem", fontFamily: '"Inter", sans-serif', fontSize: "0.68rem", color: "var(--text-secondary)" }}>
        <span>Ang 1</span>
        <span>Ang {TOTAL_ANGS}</span>
      </div>
    </div>
  );
}
