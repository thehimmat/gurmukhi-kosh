/**
 * Small pill showing where a datum came from (provenance) and whether it has
 * been reviewed. Reused across the word page and the upcoming entry tabs.
 *
 * Color encodes provenance; an open dot marks rows still awaiting review.
 * needs_work/rejected override the provenance color entirely — a human
 * reviewed this and found a problem, which is a stronger signal than "where
 * did this come from" and must not look identical to plain unreviewed.
 */

type Provenance =
  | "scraped"
  | "imported"
  | "rule_derived"
  | "computed"
  | "ai_draft"
  | "human_verified";

type ReviewStatus = "unreviewed" | "approved" | "needs_work" | "rejected";

const STYLES: Record<Provenance, { bg: string; fg: string; label: string }> = {
  scraped:        { bg: "#eceae6", fg: "#5c574f", label: "Sourced" },
  imported:       { bg: "#eceae6", fg: "#5c574f", label: "Imported" },
  rule_derived:   { bg: "#f8edd2", fg: "#8a6100", label: "Rule-derived" },
  computed:       { bg: "#e4ecf6", fg: "#34597f", label: "Computed" },
  ai_draft:       { bg: "#efe4fb", fg: "#6a3fa0", label: "AI draft" },
  human_verified: { bg: "#e1f1e6", fg: "#1d7333", label: "Verified" },
};

// Deliberately NOT reusing rule_derived's amber (#f8edd2/#8a6100) for
// needs_work — most of the rows this applies to (grammar, etymology) ARE
// rule_derived, so that collision would make a disputed row look identical to
// a plain unreviewed one, exactly the bug this component exists to avoid.
const DISPUTED_STYLE: Partial<Record<ReviewStatus, { bg: string; fg: string; label: string }>> = {
  needs_work: { bg: "#fbe4cf", fg: "#a15c00", label: "needs work" },
  rejected:   { bg: "#f7e6e0", fg: "#a13f2b", label: "rejected" },
};

export function ProvenanceBadge({
  provenance,
  reviewStatus,
}: {
  provenance: string | null;
  reviewStatus?: string | null;
}) {
  const style = STYLES[(provenance as Provenance) ?? "scraped"] ?? STYLES.scraped;
  const status = (reviewStatus as ReviewStatus) ?? "unreviewed";
  const verified = status === "approved" || provenance === "human_verified";
  const disputed = DISPUTED_STYLE[status];

  const bg = disputed ? disputed.bg : style.bg;
  const fg = disputed ? disputed.fg : style.fg;
  const label = disputed ? `${style.label} · ${disputed.label}` : style.label;

  return (
    <span
      title={`${style.label}${reviewStatus ? ` · ${status.replace("_", " ")}` : ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3rem",
        background: bg,
        color: fg,
        borderRadius: "999px",
        padding: "0.05rem 0.5rem",
        fontFamily: '"Inter", sans-serif',
        fontSize: "0.7rem",
        fontWeight: 600,
        letterSpacing: "0.02em",
        verticalAlign: "middle",
      }}
    >
      <span
        aria-hidden
        style={{
          width: "0.45rem",
          height: "0.45rem",
          borderRadius: "999px",
          background: verified || disputed ? fg : "transparent",
          border: `1.5px solid ${fg}`,
          boxSizing: "border-box",
        }}
      />
      {label}
    </span>
  );
}
