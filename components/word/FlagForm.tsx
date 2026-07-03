"use client";

/**
 * Inline "flag this" control for a single datum on the word page. Collapsed by
 * default; expands to a small form that POSTs to /api/flags. Flags are
 * write-only (see migration 014) — this component never reads anything back,
 * it only reports success/failure of the submission itself.
 *
 * Anti-spam: a honeypot field (`website`, hidden from sighted users) and a
 * minimum time-since-render check, both enforced server-side too.
 */

import { useState, type CSSProperties, type FormEvent } from "react";

type FlagType = "incorrect" | "unclear" | "has_better_source" | "other";

const FLAG_TYPE_LABEL: Record<FlagType, string> = {
  incorrect: "This looks wrong",
  unclear: "This is unclear",
  has_better_source: "I know a better source",
  other: "Something else",
};

const INPUT_STYLE: CSSProperties = {
  width: "100%",
  fontFamily: '"Inter", sans-serif',
  fontSize: "0.85rem",
  padding: "0.4rem 0.55rem",
  border: "1px solid var(--border)",
  borderRadius: "5px",
  background: "white",
  color: "var(--text-primary)",
  boxSizing: "border-box",
};

const LABEL_STYLE: CSSProperties = {
  display: "block",
  fontFamily: '"Inter", sans-serif',
  fontSize: "0.72rem",
  color: "var(--text-secondary)",
  marginBottom: "0.2rem",
};

export function FlagForm({
  wordId,
  targetTable,
  targetId,
  contextLabel,
}: {
  wordId: number;
  targetTable?: "word_grammar" | "definitions" | "etymology";
  targetId?: number;
  contextLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [renderedAt] = useState(() => Date.now());
  const [flagType, setFlagType] = useState<FlagType>("incorrect");
  const [message, setMessage] = useState("");
  const [suggestedSource, setSuggestedSource] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [reporterEmail, setReporterEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    try {
      const res = await fetch("/api/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wordId,
          targetTable: targetTable ?? null,
          targetId: targetId ?? null,
          flagType,
          message,
          suggestedSource,
          reporterName,
          reporterEmail,
          renderedAt,
          website,
        }),
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <p style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.78rem", color: "var(--text-secondary)", fontStyle: "italic", marginTop: "0.4rem" }}>
        Thanks — this has been flagged for review.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          marginTop: "0.4rem",
          fontFamily: '"Inter", sans-serif',
          fontSize: "0.75rem",
          color: "var(--text-secondary)",
          textDecoration: "underline",
          cursor: "pointer",
        }}
      >
        Flag this / suggest a correction
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        marginTop: "0.5rem",
        padding: "0.75rem",
        border: "1px solid var(--border)",
        borderRadius: "6px",
        background: "var(--bg-alt)",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        maxWidth: "26rem",
      }}
    >
      <p style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.72rem", color: "var(--text-secondary)", margin: 0 }}>
        Re: {contextLabel}
      </p>

      {/* Honeypot — hidden from sighted users, left for bots to fill in. */}
      <div style={{ position: "absolute", left: "-9999px" }} aria-hidden="true">
        <label htmlFor="flag-website">Leave blank</label>
        <input
          id="flag-website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <div>
        <label style={LABEL_STYLE} htmlFor="flag-type">What&apos;s the issue?</label>
        <select
          id="flag-type"
          style={INPUT_STYLE}
          value={flagType}
          onChange={(e) => setFlagType(e.target.value as FlagType)}
        >
          {(Object.keys(FLAG_TYPE_LABEL) as FlagType[]).map((t) => (
            <option key={t} value={t}>{FLAG_TYPE_LABEL[t]}</option>
          ))}
        </select>
      </div>

      <div>
        <label style={LABEL_STYLE} htmlFor="flag-message">Details</label>
        <textarea
          id="flag-message"
          required
          rows={3}
          maxLength={2000}
          style={{ ...INPUT_STYLE, resize: "vertical" }}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>

      <div>
        <label style={LABEL_STYLE} htmlFor="flag-source">Source (optional)</label>
        <input
          id="flag-source"
          type="text"
          placeholder="A citation or URL, if you have one"
          style={INPUT_STYLE}
          value={suggestedSource}
          onChange={(e) => setSuggestedSource(e.target.value)}
        />
      </div>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <div style={{ flex: 1 }}>
          <label style={LABEL_STYLE} htmlFor="flag-name">Name (optional)</label>
          <input
            id="flag-name"
            type="text"
            style={INPUT_STYLE}
            value={reporterName}
            onChange={(e) => setReporterName(e.target.value)}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={LABEL_STYLE} htmlFor="flag-email">Email (optional)</label>
          <input
            id="flag-email"
            type="email"
            style={INPUT_STYLE}
            value={reporterEmail}
            onChange={(e) => setReporterEmail(e.target.value)}
          />
        </div>
      </div>

      {status === "error" && (
        <p style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.75rem", color: "#a13f2b", margin: 0 }}>
          Something went wrong — please try again.
        </p>
      )}

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          type="submit"
          disabled={status === "submitting"}
          style={{
            fontFamily: '"Inter", sans-serif',
            fontSize: "0.8rem",
            fontWeight: 600,
            padding: "0.4rem 0.9rem",
            background: "var(--accent)",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: status === "submitting" ? "default" : "pointer",
            opacity: status === "submitting" ? 0.7 : 1,
          }}
        >
          {status === "submitting" ? "Sending…" : "Submit"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{
            fontFamily: '"Inter", sans-serif',
            fontSize: "0.8rem",
            padding: "0.4rem 0.9rem",
            background: "none",
            color: "var(--text-secondary)",
            border: "1px solid var(--border)",
            borderRadius: "5px",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
