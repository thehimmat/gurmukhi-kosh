"use client";

// The pad-arth builder (#23): each line, then every word with every candidate gloss and its
// grammar, then the phrases a source defines, then entries placed on no word. The curator ticks
// the glosses that fit this line; each change saves at once (padarth_save_pick, 085). Choosing is
// optional: an unpicked word shows every gloss. A picked word shows its picks, with the rest a
// toggle away. Picks of the same word on other lines show as hints and are never preselected.
//
// Keyboard (outside a text box): j/k or ↓/↑ move between words and phrases, 1–9 tick or untick
// that numbered gloss, a shows all glosses, e edits your own wording, n edits the note, Esc closes.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Candidate, DraftLine, GrammarNote } from "@/lib/padarth/draft";
import type { LineRow } from "@/lib/padarth/fetch";
import type { Hint, SavedPick } from "@/lib/padarth/picks";
import { withCuratorKey } from "@/lib/curator";
import { choiceOf, flatItems, initialPicks, isChosen, itemKey, saveInput, toggleChoice, withText, type Item, type ItemPick } from "@/lib/padarth/builder-state";
import { saveLineNote, savePick } from "@/app/admin/padarth/actions";

const SOURCE_LABEL: Record<string, string> = {
  ss_padarth: "Sahib Singh",
  shackle: "Shackle",
  mahan_kosh: "Mahan Kosh",
  sikhri: "SikhRI",
  manual: "Manual",
};
const sourceLabel = (code: string) => SOURCE_LABEL[code] ?? code;

const ATTRIBUTE_LABEL: Record<string, string> = {
  pos: "part of speech",
  gender: "gender",
  number: "number",
  gramCase: "case",
  person: "person",
  verbForm: "verb form",
};

type Status = "saving" | "saved" | { error: string };

function GrammarNoteView({ note }: { note: GrammarNote }) {
  if (note.tier === "clue") {
    return (
      <li className="padarth-grammar padarth-clue">
        {note.gramCase}? Sahib Singh glosses <span className="gurmukhi">‘{note.basis}’</span>
      </li>
    );
  }
  if (note.kind === "form_label") {
    return (
      <li className="padarth-grammar">
        ({note.text} of <span className="gurmukhi">{note.headword}</span>) <span className="padarth-source">{sourceLabel(note.sourceCode)}</span>
      </li>
    );
  }
  return (
    <li className="padarth-grammar">
      ({note.facts.map((f) => `${ATTRIBUTE_LABEL[f.attribute] ?? f.attribute}: ${f.value}`).join("; ")}){" "}
      <span className="padarth-source">{sourceLabel(note.sourceCode)}</span>
    </li>
  );
}

function CandidateText({ c }: { c: Candidate }) {
  if (c.kind === "padarth_gloss") {
    return (
      <>
        <span className="gurmukhi">{c.text}</span> <span className="padarth-source">{sourceLabel(c.sourceCode)}</span>
        {c.match === "via_base" && <span className="padarth-caveat"> through a Shackle paradigm (gloss written for ‘{c.term}’)</span>}
        {c.notes.length > 0 && (
          <ul className="padarth-notes">
            {c.notes.map((n, i) => (
              <li key={i} className="gurmukhi">
                {n}
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }
  return (
    <>
      <span>{c.text}</span>
      {c.textEn && <span className="padarth-en"> — {c.textEn}</span>}{" "}
      <span className="padarth-source">
        {c.via?.link === "mk_pointer" ? (
          <>
            <span className="gurmukhi">ਦੇਖੋ {c.via.headword}</span>, {sourceLabel(c.sourceCode)}
          </>
        ) : c.via ? (
          <>
            via <span className="gurmukhi">{c.via.headword}</span>, {sourceLabel(c.sourceCode)}
          </>
        ) : (
          sourceLabel(c.sourceCode)
        )}
        {c.senseNumber !== null && ` §${c.senseNumber}`}
      </span>
      {c.lowPriority && <span className="padarth-caveat"> spelling rebuilt from Shackle&apos;s romanisation</span>}
    </>
  );
}

type ItemProps = {
  item: Item;
  grammar: GrammarNote[];
  emptyText: string | null;
  /** Mahan Kosh "ਦੇਖੋ" targets the corpus has no word for. */
  unfollowed: string[];
  pick: ItemPick | undefined;
  status: Status | undefined;
  hints: Hint[];
  focused: boolean;
  showAll: boolean;
  editing: "override" | "note" | null;
  curatorKey: string;
  onFocus: () => void;
  onToggle: (c: Candidate) => void;
  onShowAll: () => void;
  onEdit: (field: "override" | "note" | null) => void;
  onText: (field: "override" | "note", text: string) => void;
};

function ItemView(p: ItemProps) {
  const { item, pick } = p;
  const hasPicks = !!pick && pick.refs.length > 0;
  const shown = hasPicks && !p.showAll ? item.candidates.filter((c) => isChosen(pick, c)) : item.candidates;
  const number = (c: Candidate) => item.candidates.indexOf(c) + 1;
  const id = `padarth-${itemKey(item.lineId, item.positions).replace(/[|,]/g, "-")}`;
  return (
    <li id={id} className={p.focused ? "padarth-word padarth-focus" : "padarth-word"} aria-current={p.focused || undefined} onClick={p.onFocus}>
      <div className="padarth-item-head">
        {item.kind === "word" ? (
          <a className="gurmukhi padarth-term" href={withCuratorKey(`/word/${encodeURIComponent(item.surface)}`, p.curatorKey)}>
            {item.surface}
          </a>
        ) : (
          <span className="gurmukhi padarth-term">{item.surface}</span>
        )}
        <span className="padarth-status" role="status">
          {p.status === "saving" ? "Saving…" : p.status === "saved" ? "Saved" : p.status ? `Not saved: ${p.status.error}` : ""}
        </span>
      </div>
      {p.grammar.length > 0 && (
        <ul className="padarth-grammar-list">
          {p.grammar.map((g, i) => (
            <GrammarNoteView key={i} note={g} />
          ))}
        </ul>
      )}
      {p.unfollowed.length > 0 && (
        <p className="padarth-caveat">
          Mahan Kosh points to <span className="gurmukhi">{p.unfollowed.join(", ")}</span>, which isn&apos;t in the corpus.
        </p>
      )}
      {pick?.override && p.editing !== "override" && (
        <p className="padarth-override">
          Your wording: {pick.override}{" "}
          <button type="button" className="padarth-link" onClick={() => p.onEdit("override")}>
            edit
          </button>
        </p>
      )}
      {p.editing === "override" && <TextEdit label="Your wording" initial={pick?.override ?? ""} onDone={(t) => p.onText("override", t)} onCancel={() => p.onEdit(null)} />}
      {item.candidates.length === 0 && p.emptyText ? (
        <p className="padarth-uncovered">{p.emptyText}</p>
      ) : (
        <ul className="padarth-candidates">
          {shown.map((c) => (
            <li key={`${c.kind}:${choiceOf(c).id}`} className={c.kind === "definition" && c.lowPriority ? "padarth-candidate padarth-low" : "padarth-candidate"}>
              <label>
                <input type="checkbox" checked={isChosen(pick, c)} onChange={() => p.onToggle(c)} />{" "}
                <span className="padarth-n">{number(c) <= 9 ? number(c) : ""}</span> <CandidateText c={c} />
              </label>
            </li>
          ))}
        </ul>
      )}
      {hasPicks && item.candidates.length > shown.length && (
        <button type="button" className="padarth-link" onClick={p.onShowAll}>
          Show all {item.candidates.length} glosses
        </button>
      )}
      {pick && pick.orphans.length > 0 && (
        <div className="padarth-orphans">
          <p>Picked before, but the source row has changed. Saving this item again drops these; copy what you need into your wording first.</p>
          <ul>
            {pick.orphans.map((r, i) => (
              <li key={i}>
                {r.snapshotText} <span className="padarth-source">{sourceLabel(r.sourceCode)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {p.hints.length > 0 && (
        <p className="padarth-hint">
          Picked on other lines:{" "}
          {p.hints.map((h, i) => (
            <span key={h.lineId}>
              {i > 0 && "; "}
              <a href={`/admin/line/${h.lineId}`}>line {h.lineId}</a>: {h.text}
            </span>
          ))}
        </p>
      )}
      {pick?.note && p.editing !== "note" && (
        <p className="padarth-note">
          Note: {pick.note}{" "}
          <button type="button" className="padarth-link" onClick={() => p.onEdit("note")}>
            edit
          </button>
        </p>
      )}
      {p.editing === "note" && <TextEdit label="Note" initial={pick?.note ?? ""} onDone={(t) => p.onText("note", t)} onCancel={() => p.onEdit(null)} />}
      {p.focused && p.editing === null && (
        <p className="padarth-actions">
          <button type="button" className="padarth-link" onClick={() => p.onEdit("override")}>
            {pick?.override ? "Edit" : "Add"} your wording (e)
          </button>{" "}
          <button type="button" className="padarth-link" onClick={() => p.onEdit("note")}>
            {pick?.note ? "Edit" : "Add"} a note (n)
          </button>
        </p>
      )}
    </li>
  );
}

function TextEdit({ label, initial, onDone, onCancel }: { label: string; initial: string; onDone: (t: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <label className="padarth-edit">
      {label}{" "}
      <input
        ref={ref}
        defaultValue={initial}
        maxLength={5000}
        onKeyDown={(e) => {
          if (e.key === "Enter") onDone(e.currentTarget.value);
          if (e.key === "Escape") onCancel();
        }}
        onBlur={(e) => onDone(e.currentTarget.value)}
      />
    </label>
  );
}

function LineNote({ lineId, initial }: { lineId: number; initial: string }) {
  const [status, setStatus] = useState<Status | undefined>();
  const last = useRef(initial);
  return (
    <label className="padarth-line-note">
      Line note{" "}
      <textarea
        defaultValue={initial}
        rows={2}
        maxLength={5000}
        onBlur={async (e) => {
          const text = e.currentTarget.value;
          if (text.trim() === last.current.trim()) return;
          setStatus("saving");
          try {
            await saveLineNote({ lineId, text });
            last.current = text;
            setStatus("saved");
          } catch (err) {
            setStatus({ error: (err as Error).message });
          }
        }}
      />
      <span className="padarth-status" role="status">
        {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status ? `Not saved: ${status.error}` : ""}
      </span>
    </label>
  );
}

export type PadarthDraftViewProps = {
  lines: LineRow[];
  drafts: DraftLine[];
  /** Opens word pages in curator mode (?key: /word is cached by URL, so the cookie doesn't reach it). */
  curatorKey: string;
  picks?: SavedPick[];
  lineNotes?: [number, string][];
  /** By the word's spelling: what was picked for it on lines outside this scope. */
  hints?: [string, Hint[]][];
};

export function PadarthDraftView({ lines, drafts, curatorKey, picks = [], lineNotes = [], hints = [] }: PadarthDraftViewProps) {
  const items = useMemo(() => flatItems(drafts), [drafts]);
  const [state, setState] = useState(() => initialPicks(drafts, picks));
  const [status, setStatus] = useState(new Map<string, Status>());
  const [focus, setFocus] = useState(0);
  const [showAll, setShowAll] = useState(new Set<string>());
  const [editing, setEditing] = useState<{ key: string; field: "override" | "note" } | null>(null);
  const hintMap = useMemo(() => new Map(hints), [hints]);
  const notes = useMemo(() => new Map(lineNotes), [lineNotes]);
  const byId = useMemo(() => new Map(lines.map((l) => [l.id, l])), [lines]);
  const indexOf = useMemo(() => new Map(items.map((it, i) => [itemKey(it.lineId, it.positions), i])), [items]);

  const commit = useCallback(
    async (item: Item, next: ItemPick) => {
      const key = itemKey(item.lineId, item.positions);
      setState((s) => new Map(s).set(key, next));
      setStatus((s) => new Map(s).set(key, "saving"));
      try {
        await savePick(saveInput(item, next));
        // A saved pick keeps no orphans: the save replaced its refs.
        setState((s) => new Map(s).set(key, { ...next, orphans: [] }));
        setStatus((s) => new Map(s).set(key, "saved"));
      } catch (err) {
        setStatus((s) => new Map(s).set(key, { error: (err as Error).message }));
      }
    },
    []
  );

  const toggle = useCallback(
    (item: Item, c: Candidate) => commit(item, toggleChoice(state.get(itemKey(item.lineId, item.positions)), choiceOf(c), item.candidates.map(choiceOf))),
    [commit, state]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (t && t.closest("input, textarea, select, [contenteditable]"))) return;
      const item = items[focus];
      if (!item) return;
      const key = itemKey(item.lineId, item.positions);
      const move = (i: number) => {
        const n = Math.max(0, Math.min(items.length - 1, i));
        setFocus(n);
        setEditing(null);
        const it = items[n];
        document.getElementById(`padarth-${itemKey(it.lineId, it.positions).replace(/[|,]/g, "-")}`)?.scrollIntoView({ block: "nearest" });
      };
      if (e.key === "j" || e.key === "ArrowDown") move(focus + 1);
      else if (e.key === "k" || e.key === "ArrowUp") move(focus - 1);
      else if (/^[1-9]$/.test(e.key)) {
        const c = item.candidates[Number(e.key) - 1];
        if (c) toggle(item, c);
      } else if (e.key === "a") setShowAll((s) => new Set(s).add(key));
      else if (e.key === "e") setEditing({ key, field: "override" });
      else if (e.key === "n") setEditing({ key, field: "note" });
      else if (e.key === "Escape") setEditing(null);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, focus, toggle]);

  const itemProps = (item: Item, grammar: GrammarNote[], emptyText: string | null, unfollowed: string[] = []): ItemProps => {
    const key = itemKey(item.lineId, item.positions);
    const i = indexOf.get(key) ?? 0;
    return {
      item,
      grammar,
      emptyText,
      unfollowed,
      pick: state.get(key),
      status: status.get(key),
      hints: item.kind === "word" ? (hintMap.get(item.surface) ?? []) : [],
      focused: i === focus,
      showAll: showAll.has(key),
      editing: editing?.key === key ? editing.field : null,
      curatorKey,
      onFocus: () => setFocus(i),
      onToggle: (c) => toggle(item, c),
      onShowAll: () => setShowAll((s) => new Set(s).add(key)),
      onEdit: (field) => setEditing(field ? { key, field } : null),
      onText: (field, text) => {
        setEditing(null);
        const prev = state.get(key);
        const next = withText(prev, field, text);
        if ((prev?.[field] ?? null) !== next[field]) commit(item, next);
      },
    };
  };

  return (
    <div className="padarth-draft">
      <p className="padarth-help">
        Tick the glosses that fit each line; each change saves at once. Keys: j/k move, 1–9 tick, a show all, e your wording, n note, Esc close.
      </p>
      {drafts.map((d) => {
        const line = byId.get(d.lineId);
        if (!line) return null;
        const phrasePositions = new Set(d.phrases.flatMap((p) => p.positions));
        return (
          <section key={d.lineId} className="padarth-line card">
            <p className="gurmukhi-lg padarth-verse">
              <a href={`/admin/line/${line.id}`}>{line.gurmukhi}</a>
            </p>
            <ol className="padarth-words">
              {d.words.map((w) => (
                <ItemView
                  key={w.position}
                  {...itemProps(
                    { lineId: d.lineId, kind: "word", positions: [w.position], surface: w.gurmukhi, candidates: w.candidates },
                    w.grammar,
                    phrasePositions.has(w.position) ? "Glossed in a phrase below." : "No gloss in the database.",
                    w.pointers.filter((q) => !q.resolved).map((q) => q.target)
                  )}
                />
              ))}
            </ol>
            {d.phrases.length > 0 && (
              <>
                <h4 className="padarth-heading">Phrases</h4>
                <ol className="padarth-words">
                  {d.phrases.map((ph) => (
                    <ItemView
                      key={ph.positions.join(",")}
                      {...itemProps({ lineId: d.lineId, kind: "phrase", positions: ph.positions, surface: ph.surface, candidates: ph.candidates }, ph.grammar, null)}
                    />
                  ))}
                </ol>
              </>
            )}
            {d.unplaced.length > 0 && (
              <details className="padarth-unplaced">
                <summary>Not placed on a word ({d.unplaced.length})</summary>
                <ul>
                  {d.unplaced.map((g) => (
                    <li key={g.id} className="gurmukhi">
                      {g.term} = {g.gloss}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <LineNote lineId={d.lineId} initial={notes.get(d.lineId) ?? ""} />
          </section>
        );
      })}
    </div>
  );
}
