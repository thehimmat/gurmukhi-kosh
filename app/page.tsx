"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Word } from "@/lib/supabase";
import { useGurmukhiInput } from "@atthebunga/gurmukhi-input";
import {
  DEFAULT_NUMERAL_ROLES,
  NUMERAL_ROLES,
  NUMERAL_ROLE_LABELS,
  isNumericQuery,
  normalizeNumericQuery,
  toGurmukhiNumber,
  type NumeralRole,
} from "@/lib/gurmukhi-numerals";

// /api/search hits carry how they matched; "fold" = fuzzy spelling-variant
// hit on the search_fold key (#63), shown with a "similar" chip.
type SearchResult = Word & { match?: "prefix" | "fold" | "contains" };

// A digits-only query answers with LINES rather than words: numerals are not
// dictionary entries (migration 032), so what is useful is where the number
// occurs and what job it does there.
type NumberLine = {
  lineId: number;
  ang: number;
  lineNo: number;
  gurmukhi: string;
  sourceCode: string | null;
  sourceName: string | null;
  raag: string | null;
  writer: string | null;
  role: NumeralRole;
  keyword: string | null;
  charStart: number;
  charEnd: number;
};

type NumberResponse = {
  mode: "number";
  value: number | null;
  counts: Partial<Record<NumeralRole, number>>;
  lines: NumberLine[];
};

const ROLE_HELP: Record<NumeralRole, string> = {
  author:
    "The Guru's number in a heading — ਮਹਲਾ ੫, ਮਃ ੩, ਪਾਤਿਸਾਹੀ ੧੦.",
  ghar: "The ghar (musical house) number in a heading — ਘਰੁ ੨.",
  heading_other:
    "A heading number with no ਮਹਲਾ/ਘਰੁ keyword — ਪਉੜੀ ੧੯, ਛਕਾ ੧, or a counted form like ਦੁਤੁਕੇ ੯.",
  verse_marker:
    "The tally closing a verse or shabad — ॥੧॥, ॥੪॥੪॥੧੬॥. Most numerals in the text are these, so they are hidden unless you ask for them.",
};

/** The line with its matched numeral marked, without rendering raw HTML. */
function HighlightedLine({ line }: { line: NumberLine }) {
  const { gurmukhi, charStart, charEnd } = line;
  return (
    <span className="gurmukhi-lg">
      {gurmukhi.slice(0, charStart)}
      <mark
        style={{
          background: "var(--accent-light, #f3e7db)",
          color: "inherit",
          borderRadius: "3px",
          padding: "0 0.15rem",
        }}
      >
        {gurmukhi.slice(charStart, charEnd)}
      </mark>
      {gurmukhi.slice(charEnd)}
    </span>
  );
}

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [numberResults, setNumberResults] = useState<NumberResponse | null>(null);
  const [roles, setRoles] = useState<NumeralRole[]>([...DEFAULT_NUMERAL_ROLES]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { onKeyDown: gurmukhiKeyDown, onPaste: gurmukhiPaste } = useGurmukhiInput({
    value: query,
    onChange: setQuery,
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const numeric = isNumericQuery(query);
  // Echo the query back in Gurmukhi digits even when it was typed in ASCII,
  // since that is the script it will be matched against in the text.
  const gurmukhiQuery = numeric
    ? toGurmukhiNumber(normalizeNumericQuery(query) ?? 0)
    : "";

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setNumberResults(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: query.trim() });
        // Always sent, including empty, so unchecking every box means "none"
        // rather than falling back to the server default.
        if (isNumericQuery(query)) params.set("roles", roles.join(","));
        const res = await fetch(`/api/search?${params}`);
        const data = await res.json();
        if (data.mode === "number") {
          setNumberResults(data as NumberResponse);
          setResults([]);
        } else {
          setResults(data.words ?? []);
          setNumberResults(null);
        }
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [query, roles]);

  function toggleRole(role: NumeralRole) {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  }

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!numeric && results[0]) {
      router.push(`/word/${encodeURIComponent(results[0].gurmukhi)}`);
    }
  }

  const counts = numberResults?.counts ?? {};
  const noneSelected = numeric && roles.length === 0;

  return (
    <div
      style={{
        maxWidth: "860px",
        margin: "0 auto",
        padding: "4rem 1.5rem",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: "3rem" }}>
        <h1
          className="gurmukhi-xl"
          style={{ marginBottom: "0.5rem", color: "var(--text-primary)" }}
        >
          ਗੁਰਮੁਖੀ ਕੋਸ਼
        </h1>
        <p
          style={{
            fontSize: "1.2rem",
            color: "var(--text-secondary)",
            fontStyle: "italic",
          }}
        >
          A dictionary of the words of Gurbani and early Sikh texts
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ position: "relative", marginBottom: "0.5rem" }}>
        <input
          className="gurmukhi"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={gurmukhiKeyDown}
          onPaste={gurmukhiPaste}
          placeholder="ਸ਼ਬਦ ਖੋਜੋ — search a word…"
          autoFocus
          style={{
            width: "100%",
            fontSize: "1.4rem",
            padding: "0.85rem 1.2rem",
            border: "2px solid var(--border)",
            borderRadius: "6px",
            background: "white",
            color: "var(--text-primary)",
            outline: "none",
            boxSizing: "border-box",
          }}
          onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
          onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
        />
      </form>

      {/* The role filter appears only for a digits-only query, where the
          distinction between a heading number and a verse tally is the whole
          difference between a useful result and 18,000 of them. */}
      {numeric && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "0.75rem",
            padding: "0.75rem 0.25rem 0.25rem",
            fontFamily: '"Inter", sans-serif',
            fontSize: "0.8rem",
          }}
        >
          <span style={{ color: "var(--text-secondary)" }}>
            Show <span className="gurmukhi">{gurmukhiQuery}</span> where it is a:
          </span>
          {NUMERAL_ROLES.map((role) => {
            const n = counts[role];
            const empty = n === 0;
            return (
              <label
                key={role}
                title={ROLE_HELP[role]}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  cursor: empty ? "default" : "pointer",
                  color: empty ? "var(--text-secondary)" : "var(--text-primary)",
                  opacity: empty ? 0.5 : 1,
                  border: "1px solid var(--border)",
                  borderRadius: "999px",
                  padding: "0.2rem 0.65rem",
                  background: roles.includes(role) ? "var(--accent-light, #f3e7db)" : "transparent",
                }}
              >
                <input
                  type="checkbox"
                  checked={roles.includes(role)}
                  disabled={empty}
                  onChange={() => toggleRole(role)}
                  style={{ margin: 0, cursor: empty ? "default" : "pointer" }}
                />
                <span className={role === "author" || role === "ghar" ? "gurmukhi" : undefined}>
                  {NUMERAL_ROLE_LABELS[role]}
                </span>
                {n !== undefined && (
                  <span style={{ color: "var(--text-secondary)" }}>{n.toLocaleString()}</span>
                )}
              </label>
            );
          })}
        </div>
      )}

      {loading && (
        <p
          style={{
            color: "var(--text-secondary)",
            fontFamily: '"Inter", sans-serif',
            fontSize: "0.875rem",
            padding: "0.5rem 0.25rem",
          }}
        >
          Searching…
        </p>
      )}

      {/* --- number results: lines, not dictionary entries --- */}
      {numberResults && numberResults.lines.length > 0 && (
        <ul
          style={{
            listStyle: "none",
            margin: "0.5rem 0 0",
            padding: 0,
            border: "1px solid var(--border)",
            borderRadius: "6px",
            background: "white",
            overflow: "hidden",
          }}
        >
          {numberResults.lines.map((line, i) => (
            <li
              key={`${line.lineId}-${line.charStart}`}
              style={{
                padding: "0.85rem 1.2rem",
                borderTop: i === 0 ? "none" : "1px solid var(--border)",
              }}
            >
              <HighlightedLine line={line} />
              <div
                style={{
                  marginTop: "0.35rem",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.6rem",
                  alignItems: "baseline",
                  fontFamily: '"Inter", sans-serif',
                  fontSize: "0.75rem",
                  color: "var(--text-secondary)",
                }}
              >
                <span
                  title={ROLE_HELP[line.role]}
                  style={{
                    border: "1px dashed var(--border)",
                    borderRadius: "999px",
                    padding: "0.05rem 0.5rem",
                  }}
                >
                  {NUMERAL_ROLE_LABELS[line.role]}
                </span>
                {line.sourceCode === "sggs_banidb_v2" ? (
                  <a href={`/ang/${line.ang}`} style={{ color: "var(--text-secondary)" }}>
                    Ang {line.ang}
                  </a>
                ) : (
                  <span>
                    {line.sourceName ?? "—"} {line.ang}
                  </span>
                )}
                {line.raag && <span>{line.raag}</span>}
                {line.writer && <span>{line.writer}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!loading && noneSelected && (
        <p
          style={{
            color: "var(--text-secondary)",
            fontFamily: '"Inter", sans-serif',
            fontSize: "0.9rem",
            padding: "1rem 0.25rem",
          }}
        >
          Pick at least one kind of number to show.
        </p>
      )}

      {!loading && numberResults && !noneSelected && numberResults.lines.length === 0 && (
        <p
          style={{
            color: "var(--text-secondary)",
            fontFamily: '"Inter", sans-serif',
            fontSize: "0.9rem",
            padding: "1rem 0.25rem",
          }}
        >
          No lines where {query.trim()} plays one of the selected roles.
        </p>
      )}

      {/* --- word results (unchanged) --- */}
      {results.length > 0 && (
        <ul
          style={{
            listStyle: "none",
            margin: "0.5rem 0 0",
            padding: 0,
            border: "1px solid var(--border)",
            borderRadius: "6px",
            background: "white",
            overflow: "hidden",
          }}
        >
          {results.map((word, i) => (
            <li key={word.id}>
              <a
                href={`/word/${encodeURIComponent(word.gurmukhi)}`}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "1rem",
                  padding: "0.85rem 1.2rem",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  color: "var(--text-primary)",
                  textDecoration: "none",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLAnchorElement).style.backgroundColor =
                    "var(--accent-light)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLAnchorElement).style.backgroundColor = "transparent")
                }
              >
                <span className="gurmukhi-lg" style={{ flex: 1 }}>
                  {word.gurmukhi}
                </span>
                {word.match === "fold" && (
                  <span
                    style={{
                      flexShrink: 0,
                      fontFamily: '"Inter", sans-serif',
                      fontSize: "0.7rem",
                      color: "var(--text-secondary)",
                      border: "1px dashed var(--border)",
                      borderRadius: "999px",
                      padding: "0.05rem 0.5rem",
                    }}
                    title="Spelling-variant match: found by folding sounds that vary across spellings (ਤ/ਟ, nukta, vowel length, final ੁ/ਿ)"
                  >
                    similar
                  </span>
                )}
                <span
                  className="badge"
                  style={{ flexShrink: 0 }}
                  title="occurrences across the ingested texts"
                >
                  {word.frequency.toLocaleString()}×
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {!loading && query && !numeric && results.length === 0 && (
        <p
          style={{
            color: "var(--text-secondary)",
            fontFamily: '"Inter", sans-serif',
            fontSize: "0.9rem",
            padding: "1rem 0.25rem",
          }}
        >
          No words found for &ldquo;{query}&rdquo;
        </p>
      )}

      {!query && (
        <p
          style={{
            color: "var(--text-secondary)",
            fontFamily: '"Inter", sans-serif',
            fontSize: "0.875rem",
            marginTop: "1rem",
          }}
        >
          Type Gurmukhi text directly, or browse by{" "}
          <a href="/browse">frequency</a>. Typing a number on its own searches
          numbers in the text — ਮਹਲਾ, ਘਰੁ and the rest.
        </p>
      )}
    </div>
  );
}
