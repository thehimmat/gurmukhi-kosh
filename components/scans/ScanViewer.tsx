"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PANES, parseShow, showParam, type Pane, type ScanPageView, type Show } from "@/lib/scans";

// The curator's scan viewer: page image, transcription and translation side by side, each pane
// switchable (remembered in this browser and carried in ?show=). Hovering a line or a unit lights
// up the other; a click pins it. ← and → turn the page.

const LABEL: Record<Pane, string> = { image: "Original", text: "Transcription", translation: "Translation" };
const STORE = "kosh.scanViewer.show";

type Gurbani = { text?: string; canon_id?: string | null; ssk?: string | null; fresh?: string | null };
type Doubt = { span?: string; options?: string[]; confidence?: string; why?: string };
type Term = { gurmukhi?: string; iso?: string; rendering?: string };

export function ScanViewer({ view, showParam: initial }: { view: ScanPageView; showParam: string | null }) {
  const router = useRouter();
  const [show, setShow] = useState<Show>(() => parseShow(initial));
  const [hover, setHover] = useState<number[] | null>(null);
  const [pinned, setPinned] = useState<number[] | null>(null);
  const active = hover ?? pinned ?? [];

  // No ?show in the URL: use the last choice made in this browser.
  useEffect(() => {
    if (initial != null) return;
    try {
      const saved = localStorage.getItem(STORE);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after hydration
      if (saved != null) setShow(parseShow(saved));
    } catch {}
  }, [initial]);

  const href = (page: number) => `/admin/scans/${view.text.slug}/${page}?show=${showParam(show)}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft" && view.prev != null) router.push(href(view.prev));
      if (e.key === "ArrowRight" && view.next != null) router.push(href(view.next));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // A pinned unit or line: bring its partners in the other panes into view.
  useEffect(() => {
    if (!pinned) return;
    for (const sel of [".scan-text .scan-line.is-lit", ".scan-translation .scan-unit.is-lit", ".scan-image .scan-box.is-lit"]) {
      document.querySelector(sel)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [pinned]);

  const toggle = (p: Pane) => {
    const next = { ...show, [p]: !show[p] };
    if (!PANES.some((q) => next[q])) return; // keep at least one pane
    setShow(next);
    try {
      localStorage.setItem(STORE, showParam(next));
    } catch {}
    router.replace(`?show=${showParam(next)}`, { scroll: false });
  };

  const pin = (seqs: number[]) => setPinned((cur) => (cur && cur.join() === seqs.join() ? null : seqs));
  const lit = (seqs: number[]) => seqs.some((s) => active.includes(s));
  const visible = PANES.filter((p) => show[p]);
  const imgSrc = view.page.image_path ? `/admin/scans/img/${view.page.image_path}` : null;
  const boxes = view.lines.filter((l) => l.bbox);

  return (
    <div className="scan-viewer">
      <header className="scan-bar">
        <div className="scan-title">
          <Link href="/admin/scans">Scans</Link> / <span>{view.text.title}</span>
        </div>
        <nav className="scan-nav" aria-label="Pages">
          {view.prev != null ? <Link href={href(view.prev)} aria-label="Previous page">←</Link> : <span aria-hidden>←</span>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const v = Number(new FormData(e.currentTarget).get("p"));
              if (Number.isInteger(v) && v > 0) router.push(href(v));
            }}
          >
            p. <input name="p" defaultValue={view.page.page} key={view.page.page} inputMode="numeric" aria-label="Page" />
          </form>
          {view.next != null ? <Link href={href(view.next)} aria-label="Next page">→</Link> : <span aria-hidden>→</span>}
        </nav>
        <div className="scan-toggles" role="group" aria-label="Panes">
          {PANES.map((p) => (
            <button key={p} type="button" aria-pressed={show[p]} onClick={() => toggle(p)}>
              {LABEL[p]}
            </button>
          ))}
        </div>
      </header>

      <div className="scan-panes" style={{ "--scan-cols": visible.length } as React.CSSProperties}>
        {show.image && (
          <section className="scan-pane scan-image" aria-label={LABEL.image}>
            {imgSrc ? (
              <div className="scan-image-frame">
                <img src={imgSrc} alt={`${view.text.title}, page ${view.page.page}`} />
                {boxes.map((l) => (
                  <div
                    key={l.n}
                    className={`scan-box${lit(l.units) ? " is-lit" : ""}`}
                    style={{ left: `${l.bbox![0] * 100}%`, top: `${l.bbox![1] * 100}%`, width: `${l.bbox![2] * 100}%`, height: `${l.bbox![3] * 100}%` }}
                    onMouseEnter={() => setHover(l.units)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => pin(l.units)}
                  />
                ))}
              </div>
            ) : (
              <p className="scan-empty">No image for this page yet.</p>
            )}
          </section>
        )}

        {show.text && (
          <section className="scan-pane scan-text" aria-label={LABEL.text}>
            {view.lines.length === 0 && <p className="scan-empty">No transcription for this page.</p>}
            {view.lines.map((l) => (
              <p
                key={l.n}
                className={`gurmukhi scan-line scan-line-${l.type}${lit(l.units) ? " is-lit" : ""}${l.units.length ? " has-unit" : ""}`}
                onMouseEnter={() => l.units.length && setHover(l.units)}
                onMouseLeave={() => setHover(null)}
                onClick={() => l.units.length && pin(l.units)}
              >
                <span className="scan-line-n" aria-hidden>{l.n}</span>
                {l.text}
              </p>
            ))}
          </section>
        )}

        {show.translation && (
          <section className="scan-pane scan-translation" aria-label={LABEL.translation}>
            {view.units.length === 0 && <p className="scan-empty">Nothing translated on this page.</p>}
            {view.units.map((u) => (
              <article
                key={u.seq}
                className={`scan-unit${lit([u.seq]) ? " is-lit" : ""}`}
                onMouseEnter={() => setHover([u.seq])}
                onMouseLeave={() => setHover(null)}
                onClick={(e) => {
                  if (!(e.target as HTMLElement).closest("summary, a")) pin([u.seq]);
                }}
              >
                <header>
                  <span className="scan-unit-label">{u.label}</span>
                  {u.continued && <span className="scan-tag">continued from p. {Math.min(...u.pages)}</span>}
                  {u.pages.length > 1 && <span className="scan-tag">pp. {u.pages.join(", ")}</span>}
                </header>
                <div className="scan-unit-body">{u.translation}</div>
                {(u.gurbani as Gurbani[]).length > 0 && (
                  <div className="scan-gurbani">
                    {(u.gurbani as Gurbani[]).map((g, i) => (
                      <div key={i}>
                        <p className="gurmukhi">{g.text}</p>
                        {g.ssk && <p><span className="scan-tag">Sant Singh Khalsa</span> {g.ssk}</p>}
                        {g.fresh && <p><span className="scan-tag">In this reading</span> {g.fresh}</p>}
                      </div>
                    ))}
                  </div>
                )}
                <Notes u={u} />
              </article>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

function Notes({ u }: { u: ScanPageView["units"][number] }) {
  const doubts = u.doubts as Doubt[];
  const terms = u.terms as Term[];
  const nuances = u.nuances.filter((n): n is string => typeof n === "string");
  if (!u.literal && !u.context && !nuances.length && !doubts.length && !terms.length) return null;
  return (
    <details className="scan-notes">
      <summary>
        Notes{doubts.length ? ` · ${doubts.length} doubt${doubts.length > 1 ? "s" : ""}` : ""}
      </summary>
      {u.literal && <Field name="Literal">{u.literal}</Field>}
      {u.context && <Field name="Context">{u.context}</Field>}
      {nuances.length > 0 && (
        <Field name="Nuances">
          <ul>{nuances.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </Field>
      )}
      {doubts.length > 0 && (
        <Field name="Doubts">
          <ul>
            {doubts.map((d, i) => (
              <li key={i}>
                <span className="gurmukhi">{d.span}</span>
                {d.confidence && <span className="scan-tag">{d.confidence}</span>}
                {d.options?.length ? <ol>{d.options.map((o, j) => <li key={j}>{o}</li>)}</ol> : null}
                {d.why && <p className="scan-why">{d.why}</p>}
              </li>
            ))}
          </ul>
        </Field>
      )}
      {terms.length > 0 && (
        <Field name="Terms">
          <ul>
            {terms.map((t, i) => (
              <li key={i}>
                <span className="gurmukhi">{t.gurmukhi}</span> <i>{t.iso}</i>: {t.rendering}
              </li>
            ))}
          </ul>
        </Field>
      )}
    </details>
  );
}

function Field({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="scan-field">
      <h4>{name}</h4>
      {children}
    </div>
  );
}
