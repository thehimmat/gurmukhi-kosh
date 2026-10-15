"use client";

import { useEffect, useState } from "react";
import type { CommentarySource } from "@/lib/line-context";

// Which commentary shows under each line of the viewer (#146). Every line's
// commentaries are already in the page, hidden; choosing one sets an
// attribute on the line list that CSS reads, so switching is instant and the
// page itself stays cacheable. The choice is remembered per browser.
const KEY = "viewer.commentary";
export const LINES_ID = "viewer-lines";

function apply(code: string) {
  document.getElementById(LINES_ID)?.setAttribute("data-commentary", code);
}

export function CommentaryPicker({ sources }: { sources: CommentarySource[] }) {
  const [chosen, setChosen] = useState("off");

  useEffect(() => {
    let saved = "off";
    try { saved = localStorage.getItem(KEY) ?? "off"; } catch {}
    if (saved !== "off" && !sources.some((s) => s.code === saved)) saved = "off";
    setChosen(saved);
    apply(saved);
  }, [sources]);

  function choose(code: string) {
    setChosen(code);
    apply(code);
    try { localStorage.setItem(KEY, code); } catch {}
  }

  if (sources.length === 0) return null;
  const options = [{ code: "off", name: "Off", author: null }, ...sources];

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "0.4rem 0.5rem", fontFamily: '"Inter", sans-serif', fontSize: "0.8rem" }}>
      <span style={{ color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Commentary</span>
      <div role="radiogroup" aria-label="Commentary under each line" style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
        {options.map((o) => {
          const on = chosen === o.code;
          return (
            <button
              key={o.code}
              type="button"
              role="radio"
              aria-checked={on}
              title={o.author ?? undefined}
              onClick={() => choose(o.code)}
              style={{
                border: "1px solid var(--border)",
                borderRadius: "999px",
                padding: "0.2rem 0.7rem",
                cursor: "pointer",
                background: on ? "var(--accent)" : "white",
                color: on ? "white" : "var(--text-secondary)",
              }}
            >{o.name}</button>
          );
        })}
      </div>
    </div>
  );
}
