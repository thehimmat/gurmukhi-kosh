/**
 * Small pill showing where a datum came from (provenance) and whether it has
 * been reviewed. Reused across the word page and the upcoming entry tabs.
 *
 * Color encodes provenance; an open dot marks rows still awaiting review.
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

  return (
    <span
      title={`${style.label}${reviewStatus ? ` · ${status.replace("_", " ")}` : ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3rem",
        background: style.bg,
        color: style.fg,
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
          background: verified ? style.fg : "transparent",
          border: `1.5px solid ${style.fg}`,
          boxSizing: "border-box",
        }}
      />
      {style.label}
    </span>
  );
}
