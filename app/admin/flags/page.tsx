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
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    notFound();
  }

  const db = supabaseAdmin();
  const [{ data: flagRows }, { data: heatmapData }] = await Promise.all([
    db
      .from("flags")
      .select("*, words(gurmukhi, frequency)")
      .eq("status", "open")
      .order("created_at", { ascending: true }),
    db.rpc("flag_heatmap"),
  ]);

  const flags = (flagRows ?? []) as unknown as FlagWithWord[];
  const heatmap = (heatmapData ?? []) as { ang: number; weight: number }[];

  // Group by word, sorted by that word's corpus frequency — a flag on a word
  // occurring 400 times matters far more than one occurring once, and grouping
  // surfaces every flag on that word together instead of scattering them.
  const byWord = new Map<number, { gurmukhi: string; frequency: number; flags: FlagWithWord[] }>();
  for (const flag of flags) {
    const entry = byWord.get(flag.word_id) ?? {
      gurmukhi: flag.words?.gurmukhi ?? `word #${flag.word_id}`,
      frequency: flag.words?.frequency ?? 0,
      flags: [],
    };
    entry.flags.push(flag);
    byWord.set(flag.word_id, entry);
  }
  const groups = Array.from(byWord.entries()).sort((a, b) => b[1].frequency - a[1].frequency);

  return (
    <div style={{ maxWidth: "860px", margin: "0 auto", padding: "3rem 1.5rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "0.25rem" }}>Flag queue</h1>
      <p style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.875rem", color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
        {flags.length} open flag{flags.length === 1 ? "" : "s"} across {groups.length} word{groups.length === 1 ? "" : "s"}, sorted by corpus frequency
      </p>

      {heatmap.length > 0 && <AngHeatmap data={heatmap} />}

      {flags.length === 0 && (
        <p style={{ fontFamily: '"Inter", sans-serif', color: "var(--text-secondary)", fontStyle: "italic" }}>
          Nothing to review.
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
    </div>
  );
}
