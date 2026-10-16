"use client";

import { useEffect, useState } from "react";
import { VIEWS, type ResourceSource, type ViewId } from "../../lib/line-context";

// The right-hand pane's controls (#146): which view (Translation, Punjabi
// commentary, …) and, within it, which sources. Every resource is already in
// the page; this only sets attributes on the line grid that CSS reads, so
// switching is instant and the page stays cacheable. Remembered per browser.
const KEY = "viewer.resources";
export const GRID_ID = "viewer-lines";

export type PickerState = { view: ViewId; on: Partial<Record<ViewId, string[]>> };

/** The grid attributes for a state: data-view, and data-on-<code> per shown source. */
export function gridAttributes(state: PickerState): Record<string, string> {
  const attrs: Record<string, string> = { "data-view": state.view };
  for (const code of state.on[state.view] ?? []) attrs[`data-on-${code}`] = "1";
  return attrs;
}

function apply(state: PickerState) {
  const el = document.getElementById(GRID_ID);
  if (!el) return;
  for (const a of [...el.attributes]) if (a.name.startsWith("data-on-")) el.removeAttribute(a.name);
  for (const [k, v] of Object.entries(gridAttributes(state))) el.setAttribute(k, v);
}

export function ResourcePicker({ sources, initial }: { sources: ResourceSource[]; initial: PickerState }) {
  const [state, setState] = useState<PickerState>(initial);
  const present = new Set(sources.map((s) => s.code));
  const views = VIEWS.filter((v) => v.sources.some((s) => present.has(s)));

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as PickerState | null;
      if (saved?.view && saved.on && views.some((v) => v.id === saved.view)) {
        const merged: PickerState = { view: saved.view, on: { ...initial.on, ...saved.on } };
        setState(merged);
        apply(merged);
      }
    } catch {}
    // Once, on load: a saved choice replaces the server's default.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(next: PickerState) {
    setState(next);
    apply(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  }

  function toggle(view: ViewId, code: string) {
    const cur = state.on[view] ?? [];
    const on = cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code];
    update({ ...state, on: { ...state.on, [view]: on } });
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
              onClick={() => update({ ...state, view: v.id })}
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
    </div>
  );
}

/** A chip's label: the author when the source is named for its form. */
export function sourceLabel(src: ResourceSource): string {
  const who = src.author?.replace(/\s*\(.*\)$/, "").replace(/,.*$/, "");
  return who ? `${src.name} · ${who}` : src.name;
}
