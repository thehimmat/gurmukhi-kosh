"use client";

import { useEffect, useState } from "react";
import {
  GRID_ID, VIEWS, applyViewerPrefs, gridAttributes, parseViewerPrefs, sourceLabel, withChoice,
  type PickerState, type ResourceSource, type ViewId, type ViewerPrefs,
} from "../../lib/line-context";

// The right-hand pane's controls (#146): which view (Translation, Punjabi
// commentary, …) and, within it, which sources. Every resource is already in
// the page; this only sets attributes on the line grid that CSS reads, so
// switching is instant and the page stays cacheable. Only what the reader
// changes is remembered (#224), so each page keeps its own defaults otherwise.
// Only the component is exported: a server component can render it but can't
// call a function from this "use client" module (the grid helpers it shares
// with LineView live in lib/line-context.ts).
const KEY = "viewer.prefs";
// The pre-#224 snapshot of every on-list; it can't tell choices from defaults.
const OLD_KEY = "viewer.resources";

function apply(state: PickerState) {
  const el = document.getElementById(GRID_ID);
  if (!el) return;
  for (const a of [...el.attributes]) if (a.name.startsWith("data-on-")) el.removeAttribute(a.name);
  for (const [k, v] of Object.entries(gridAttributes(state))) el.setAttribute(k, v);
}

function load(): ViewerPrefs {
  try {
    localStorage.removeItem(OLD_KEY);
    return parseViewerPrefs(JSON.parse(localStorage.getItem(KEY) ?? "null"));
  } catch {
    return { choices: {} };
  }
}

export function ResourcePicker({ sources, initial }: { sources: ResourceSource[]; initial: PickerState }) {
  const [state, setState] = useState<PickerState>(initial);
  const [prefs, setPrefs] = useState<ViewerPrefs>({ choices: {} });
  const present = new Set(sources.map((s) => s.code));
  const views = VIEWS.filter((v) => v.sources.some((s) => present.has(s)));

  useEffect(() => {
    const saved = load();
    const merged = applyViewerPrefs(initial, saved, present);
    setPrefs(saved);
    setState(merged);
    apply(merged);
    // Once, on load: the reader's choices over this page's defaults.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(nextPrefs: ViewerPrefs) {
    const next = applyViewerPrefs(initial, nextPrefs, present);
    setPrefs(nextPrefs);
    setState(next);
    apply(next);
    try { localStorage.setItem(KEY, JSON.stringify(nextPrefs)); } catch {}
  }

  function toggle(view: ViewId, code: string) {
    update(withChoice(prefs, code, !(state.on[view] ?? []).includes(code)));
  }

  if (views.length === 0) return null;
  const current = views.find((v) => v.id === state.view) ?? views[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", fontFamily: '"Inter", sans-serif', fontSize: "0.8rem" }}>
      <div role="tablist" aria-label="Resources" style={{ display: "flex", gap: "1.1rem", borderBottom: "1px solid var(--border)" }}>
        {views.map((v) => {
          const on = v.id === current.id;
          return (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => update({ ...prefs, view: v.id })}
              style={{
                border: "none", background: "none", padding: "0.4rem 0", cursor: "pointer",
                fontWeight: on ? 600 : 400,
                color: on ? "var(--text-primary)" : "var(--text-secondary)",
                borderBottom: on ? "2px solid var(--text-primary)" : "2px solid transparent",
              }}
            >{v.label}</button>
          );
        })}
      </div>
      <div role="group" aria-label={`${current.label} sources`} style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
        {current.sources.filter((c) => present.has(c)).map((code) => {
          const src = sources.find((s) => s.code === code)!;
          const on = (state.on[current.id] ?? []).includes(code);
          return (
            <button
              key={code}
              type="button"
              aria-pressed={on}
              title={src.author ?? undefined}
              onClick={() => toggle(current.id, code)}
              style={{
                border: "1px solid var(--border)", borderRadius: "999px", padding: "0.2rem 0.75rem", cursor: "pointer",
                background: on ? "var(--accent)" : "white", color: on ? "white" : "var(--text-secondary)",
              }}
            >{sourceLabel(src)}</button>
          );
        })}
      </div>
      {(state.on[current.id] ?? []).length === 0 && (
        <p className="viewer-none">All sources are hidden. Choose one above to show it.</p>
      )}
    </div>
  );
}
