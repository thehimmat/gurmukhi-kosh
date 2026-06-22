"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Word } from "@/lib/supabase";
import { useGurmukhiInput } from "@atthebunga/gurmukhi-input";

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Word[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { onKeyDown: gurmukhiKeyDown, onPaste: gurmukhiPaste } = useGurmukhiInput({
    value: query,
    onChange: setQuery,
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        setResults(data.words ?? []);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [query]);

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    if (results[0]) {
      router.push(`/word/${encodeURIComponent(results[0].gurmukhi)}`);
    }
  }

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
          A dictionary of every word in Sri Guru Granth Sahib Ji
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
                <span
                  className="badge"
                  style={{ flexShrink: 0 }}
                  title="occurrences in SGGS"
                >
                  {word.frequency.toLocaleString()}×
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {!loading && query && results.length === 0 && (
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
          <a href="/browse">frequency</a>.
        </p>
      )}
    </div>
  );
}
