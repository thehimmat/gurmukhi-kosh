import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import type { Flag } from "@/lib/supabase";
import { resolveFlag } from "./actions";
import { AngHeatmap } from "@/components/admin/AngHeatmap";

import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Flag queue — Gurmukhi Kosh",
  robots: { index: false, follow: false },
};

const FLAG_TYPE_LABEL: Record<string, string> = {
  incorrect: "Looks wrong",
  unclear: "Unclear",
  has_better_source: "Better source known",
  other: "Other",
};

const TARGET_LABEL: Record<string, string> = {
  word_grammar: "Grammar",
  definitions: "Definition",
  etymology: "Etymology",
};

type FlagWithWord = Flag & { words: { gurmukhi: string; frequency: number } | null };

// Must match pipeline/grammar/auto-flag.ts's SYSTEM_REPORTER. A "doubt" flag is
// an automated one raised for an unverified rule; those dominate at corpus scale
// (thousands, from ~2 rules) and would bury the handful of genuinely reviewable
// conflicts + real user submissions, so they live behind their own filter.
const SYSTEM_REPORTER = "Rule engine (automated)";
function isDoubtFlag(f: FlagWithWord): boolean {
  return f.reporter_name === SYSTEM_REPORTER && f.flag_type === "unclear";
}

type FilterView = "review" | "doubt" | "all";

// Cap how many word-groups we render. The doubt view can be thousands of
// near-identical rows; frequency-sorted, so the capped set is the highest-impact
// slice. Fetching stays complete (for accurate counts); only rendering is capped.
const MAX_GROUPS_RENDERED = 150;

// Paginated so the fetch never hits Supabase's silent 1000-row cap — with the
// corpus-wide auto-flag pass this table holds thousands of open flags, and an
// unpaginated select would quietly drop everything past the first 1000.
async function fetchAllOpenFlags(db: ReturnType<typeof supabaseAdmin>): Promise<FlagWithWord[]> {
  const rows: FlagWithWord[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db
      .from("flags")
      .select("*, words(gurmukhi, frequency)")
      .eq("status", "open")
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`fetchAllOpenFlags: ${error.message}`);
    const batch = (data ?? []) as unknown as FlagWithWord[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

function FilterTabs({ current, flagKey, counts }: {
  current: FilterView;
  flagKey: string;
  counts: Record<FilterView, number>;
}) {
  const tabs: { view: FilterView; label: string }[] = [
    { view: "review", label: "To review" },
    { view: "doubt", label: "Rule doubt" },
    { view: "all", label: "All" },
  ];
  return (
    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
      {tabs.map(({ view, label }) => {
        const active = view === current;
        return (
          <a
            key={view}
            href={`/admin/flags?key=${encodeURIComponent(flagKey)}&filter=${view}`}
            style={{
              fontFamily: '"Inter", sans-serif',
              fontSize: "0.8rem",
              fontWeight: active ? 600 : 400,
              padding: "0.3rem 0.7rem",
              borderRadius: "999px",
              textDecoration: "none",
              background: active ? "var(--accent)" : "var(--bg-alt)",
              color: active ? "white" : "var(--text-secondary)",
              border: "1px solid var(--border)",
            }}
          >
            {label} ({counts[view].toLocaleString()})
          </a>
        );
      })}
    </div>
  );
}

function FlagCard({ flag, flagKey }: { flag: FlagWithWord; flagKey: string }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "0.85rem 1.1rem", background: "white" }}>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "baseline", flexWrap: "wrap", marginBottom: "0.5rem" }}>
        <span className="badge">{FLAG_TYPE_LABEL[flag.flag_type] ?? flag.flag_type}</span>
        {flag.target_table && (
          <span style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            {TARGET_LABEL[flag.target_table] ?? flag.target_table}
            {flag.target_id ? ` #${flag.target_id}` : ""}
          </span>
        )}
        <span style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.72rem", color: "var(--text-secondary)", marginLeft: "auto" }}>
          {new Date(flag.created_at).toLocaleString()}
        </span>
      </div>

      <p style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.9rem", whiteSpace: "pre-wrap", marginBottom: "0.4rem" }}>
        {flag.message}
      </p>
      {flag.suggested_source && (
        <p style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "0.4rem" }}>
          Suggested source: {flag.suggested_source}
        </p>
      )}
      {(flag.reporter_name || flag.reporter_email) && (
        <p style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "0.75rem" }}>
          From: {[flag.reporter_name, flag.reporter_email].filter(Boolean).join(" · ")}
        </p>
      )}

      <form action={resolveFlag} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}>
        <input type="hidden" name="key" value={flagKey} />
        <input type="hidden" name="flagId" value={flag.id} />
        {flag.target_table && <input type="hidden" name="targetTable" value={flag.target_table} />}
        {flag.target_id && <input type="hidden" name="targetId" value={flag.target_id} />}

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          {flag.target_table && flag.target_id && (
            <select
              name="reviewStatus"
              defaultValue=""
              style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.8rem", padding: "0.3rem 0.5rem", border: "1px solid var(--border)", borderRadius: "5px" }}
            >
              <option value="">Leave review status unchanged</option>
              <option value="approved">Mark target approved</option>
              <option value="needs_work">Mark target needs work</option>
              <option value="rejected">Mark target rejected</option>
            </select>
          )}
          <input
            type="text"
            name="resolutionNote"
            placeholder="Resolution note (optional)"
            style={{ flex: 1, minWidth: "12rem", fontFamily: '"Inter", sans-serif', fontSize: "0.8rem", padding: "0.3rem 0.5rem", border: "1px solid var(--border)", borderRadius: "5px" }}
          />
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="submit"
            name="decision"
            value="resolved"
            style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.8rem", fontWeight: 600, padding: "0.35rem 0.8rem", background: "var(--accent)", color: "white", border: "none", borderRadius: "5px", cursor: "pointer" }}
          >
            Resolve
          </button>
          <button
            type="submit"
            name="decision"
            value="dismissed"
            style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.8rem", padding: "0.35rem 0.8rem", background: "none", color: "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: "5px", cursor: "pointer" }}
          >
            Dismiss
          </button>
        </div>
      </form>
    </div>
  );
}

export default async function FlagQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string; filter?: string }>;
}) {
  const { key, filter: filterParam } = await searchParams;
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    notFound();
  }
  const filter: FilterView = filterParam === "doubt" ? "doubt" : filterParam === "all" ? "all" : "review";

  const db = supabaseAdmin();
  const [allFlags, heatmapData] = await Promise.all([
    fetchAllOpenFlags(db),
    db.rpc("flag_heatmap").then((r) => r.data),
  ]);
  const heatmap = (heatmapData ?? []) as { ang: number; weight: number }[];

  const doubtFlags = allFlags.filter(isDoubtFlag);
  const reviewFlags = allFlags.filter((f) => !isDoubtFlag(f));
  const counts: Record<FilterView, number> = {
    review: reviewFlags.length,
    doubt: doubtFlags.length,
    all: allFlags.length,
  };
  const shown = filter === "doubt" ? doubtFlags : filter === "all" ? allFlags : reviewFlags;

  // Group by word, sorted by that word's corpus frequency — a flag on a word
  // occurring 400 times matters far more than one occurring once, and grouping
  // surfaces every flag on that word together instead of scattering them.
  const byWord = new Map<number, { gurmukhi: string; frequency: number; flags: FlagWithWord[] }>();
  for (const flag of shown) {
    const entry = byWord.get(flag.word_id) ?? {
      gurmukhi: flag.words?.gurmukhi ?? `word #${flag.word_id}`,
      frequency: flag.words?.frequency ?? 0,
      flags: [],
    };
    entry.flags.push(flag);
    byWord.set(flag.word_id, entry);
  }
  const allGroups = Array.from(byWord.entries()).sort((a, b) => b[1].frequency - a[1].frequency);
  const groups = allGroups.slice(0, MAX_GROUPS_RENDERED);
  const hiddenWords = allGroups.length - groups.length;

  return (
    <div style={{ maxWidth: "860px", margin: "0 auto", padding: "3rem 1.5rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "0.25rem" }}>Flag queue</h1>
      <p style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "1.25rem" }}>
        {shown.length.toLocaleString()} flag{shown.length === 1 ? "" : "s"} in this view across {allGroups.length.toLocaleString()} word{allGroups.length === 1 ? "" : "s"}, sorted by corpus frequency
      </p>

      <FilterTabs current={filter} flagKey={key!} counts={counts} />

      {filter === "doubt" && (
        <p style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.82rem", color: "var(--text-secondary)", background: "var(--bg-alt)", border: "1px solid var(--border)", borderRadius: "6px", padding: "0.6rem 0.85rem", marginBottom: "1.25rem" }}>
          These are readings the rule engine produced from grammar rules not yet verified against the published Gurbani Viakaran (mostly two: mukta&nbsp;→&nbsp;oblique and sihari&nbsp;→&nbsp;oblique). Verifying those rules at the source resolves most of these at once — reviewing them one by one is not the intended workflow.
        </p>
      )}

      {filter !== "review" && heatmap.length > 0 && <AngHeatmap data={heatmap} />}

      {shown.length === 0 && (
        <p style={{ fontFamily: '"Inter", sans-serif', color: "var(--text-secondary)", fontStyle: "italic" }}>
          Nothing to review here.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
        {groups.map(([wordId, group]) => (
          <div key={wordId}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.6rem", marginBottom: "0.6rem" }}>
              <a
                href={`/word/${encodeURIComponent(group.gurmukhi)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="gurmukhi"
                style={{ fontSize: "1.2rem", color: "var(--accent)", textDecoration: "none" }}
              >
                {group.gurmukhi}
              </a>
              <span style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                {group.frequency.toLocaleString()} occurrences in corpus
              </span>
              <span style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                · {group.flags.length} flag{group.flags.length === 1 ? "" : "s"}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {group.flags.map((flag) => (
                <FlagCard key={flag.id} flag={flag} flagKey={key!} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {hiddenWords > 0 && (
        <p style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.82rem", color: "var(--text-secondary)", fontStyle: "italic", marginTop: "1.75rem" }}>
          Showing the top {groups.length.toLocaleString()} words by frequency · {hiddenWords.toLocaleString()} more not shown.
        </p>
      )}
    </div>
  );
}
