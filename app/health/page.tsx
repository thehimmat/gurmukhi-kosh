import { computeHealth, type Metric, type MetricStatus, type Row } from "@/lib/health";

import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Health — Gurmukhi Kosh",
  description: "Live data-quality and coverage stats for the Gurmukhi Kosh corpus.",
};

const STATUS_STYLE: Record<MetricStatus, { bg: string; fg: string }> = {
  ok: { bg: "var(--accent-light)", fg: "var(--accent)" },
  warn: { bg: "#f7e6e0", fg: "#a13f2b" },
  info: { bg: "#eee9e2", fg: "#5c534d" },
};

function StatusDot({ status }: { status: MetricStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      style={{
        display: "inline-block",
        width: "0.5rem",
        height: "0.5rem",
        borderRadius: "999px",
        backgroundColor: s.fg,
        marginRight: "0.5rem",
        flexShrink: 0,
      }}
    />
  );
}

function isRowArray(value: Metric["value"]): value is Row[] {
  return Array.isArray(value);
}

function MetricCard({ metric }: { metric: Metric }) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "1rem 1.1rem",
        backgroundColor: "white",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        {metric.status && <StatusDot status={metric.status} />}
        <div style={{ flex: 1 }}>
          <p
            style={{
              fontFamily: '"Inter", sans-serif',
              fontSize: "0.8rem",
              color: "var(--text-secondary)",
              marginBottom: "0.35rem",
            }}
          >
            {metric.label}
          </p>

          {isRowArray(metric.value) ? (
            <RowTable rows={metric.value} />
          ) : (
            <p
              style={{
                fontFamily: '"Inter", sans-serif',
                fontSize: "1.4rem",
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              {typeof metric.value === "number" ? metric.value.toLocaleString() : metric.value}
            </p>
          )}

          {metric.note && (
            <p
              style={{
                fontFamily: '"Inter", sans-serif',
                fontSize: "0.78rem",
                color: "var(--text-secondary)",
                marginTop: "0.4rem",
              }}
            >
              {metric.note}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function RowTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return (
      <p style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.85rem", color: "var(--text-secondary)" }}>
        (none)
      </p>
    );
  }
  const columns = Object.keys(rows[0]);
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: '"Inter", sans-serif', fontSize: "0.85rem" }}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th
              key={col}
              style={{
                textAlign: col === columns[0] ? "left" : "right",
                padding: "0.25rem 0.5rem 0.25rem 0",
                color: "var(--text-secondary)",
                fontWeight: 500,
                borderBottom: "1px solid var(--border)",
              }}
            >
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {columns.map((col) => (
              <td
                key={col}
                style={{
                  textAlign: col === columns[0] ? "left" : "right",
                  padding: "0.3rem 0.5rem 0.3rem 0",
                }}
              >
                {row[col]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function HealthPage() {
  const report = await computeHealth();

  const groups = new Map<string, Metric[]>();
  for (const metric of report.metrics) {
    const list = groups.get(metric.group) ?? [];
    list.push(metric);
    groups.set(metric.group, list);
  }

  return (
    <div style={{ maxWidth: "860px", margin: "0 auto", padding: "3rem 1.5rem" }}>
      <div style={{ marginBottom: "2rem" }}>
        <a
          href="/"
          style={{
            fontFamily: '"Inter", sans-serif',
            fontSize: "0.875rem",
            color: "var(--text-secondary)",
            textDecoration: "none",
          }}
        >
          ← search
        </a>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginTop: "1rem", marginBottom: "0.25rem" }}>
          Data Health
        </h1>
        <p style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.875rem", color: "var(--text-secondary)" }}>
          Recomputed on every load · {new Date(report.generatedAt).toLocaleString()}
        </p>
      </div>

      {Array.from(groups.entries()).map(([group, metrics]) => (
        <section key={group} style={{ marginBottom: "2.5rem" }}>
          <h2
            style={{
              fontFamily: '"Inter", sans-serif',
              fontSize: "1rem",
              fontWeight: 600,
              marginBottom: "0.9rem",
              color: "var(--text-primary)",
            }}
          >
            {group}
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "0.9rem" }}>
            {metrics.map((metric) => (
              <MetricCard key={metric.key} metric={metric} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
