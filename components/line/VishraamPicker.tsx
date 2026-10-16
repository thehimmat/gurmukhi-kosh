"use client";

import { useEffect, useState } from "react";
import { GRID_ID } from "../../lib/line-context";
import { VISHRAAM_SETS, type VishraamSet } from "../../lib/vishraam";

// The Gurmukhi pane's control (#217): which set of vishraam marks colours the
// text, or none. Like ResourcePicker it only sets an attribute on the line
// grid (data-vishraam) that CSS reads, so the page stays cacheable.
// Remembered per browser. Exports only the component (see ResourcePicker).
const KEY = "viewer.vishraam";
type Choice = VishraamSet | "off";

function apply(choice: Choice) {
  document.getElementById(GRID_ID)?.setAttribute("data-vishraam", choice);
}

export function VishraamPicker({ sets, initial }: { sets: VishraamSet[]; initial: Choice }) {
  const [choice, setChoice] = useState<Choice>(initial);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY) as Choice | null;
      if (saved && (saved === "off" || sets.includes(saved))) {
        setChoice(saved);
        apply(saved);
      }
    } catch {}
    // Once, on load: a saved choice replaces the server's default.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pick(next: Choice) {
    setChoice(next);
    apply(next);
    try { localStorage.setItem(KEY, next); } catch {}
  }

  if (sets.length === 0) return null;
  const options: { id: Choice; label: string }[] = [
    { id: "off", label: "Off" },
    ...VISHRAAM_SETS.filter((s) => sets.includes(s.id)),
  ];

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.35rem 0.6rem", fontFamily: '"Inter", sans-serif', fontSize: "0.8rem" }}>
      <span style={{ color: "var(--text-secondary)", fontWeight: 600 }}>Vishraam</span>
      <span role="group" aria-label="Vishraam marks" style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: "6px", overflow: "hidden" }}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={choice === o.id}
            onClick={() => pick(o.id)}
            style={{
              border: "none", padding: "0.2rem 0.7rem", cursor: "pointer",
              background: choice === o.id ? "var(--accent)" : "white",
              color: choice === o.id ? "white" : "var(--text-secondary)",
            }}
          >{o.label}</button>
        ))}
      </span>
      {choice !== "off" && (
        <span style={{ color: "var(--text-secondary)" }}>
          <span className="vishraam-key" data-k="v">●</span> pause{" "}
          <span className="vishraam-key" data-k="y">●</span> light pause
        </span>
      )}
    </div>
  );
}
