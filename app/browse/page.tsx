import { supabase } from "@/lib/supabase";

import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Browse — Gurmukhi Kosh",
};

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1"));
  const pageSize = 50;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Frequency-ranked list of the SGGS corpus; off-corpus dictionary lemmas
  // (e.g. Shackle headwords not attested in the corpus, frequency 0) are
  // excluded here but remain reachable via search and their word pages.
  const { data: words, count } = await supabase
    .from("words")
    .select("id, gurmukhi, frequency", { count: "exact" })
    .eq("in_corpus", true)
    .order("frequency", { ascending: false })
    .range(from, to);

  const totalPages = count ? Math.ceil(count / pageSize) : 1;

  return (
    <div style={{ maxWidth: "860px", margin: "0 auto", padding: "3rem 1.5rem" }}>
      <div style={{ marginBottom: "2rem" }}>
        <a
          href="/"
          style={{
            fontFamily: '"Inter", sans-serif',
            fontSize: "0.875rem",
            color: "var(--text-secondary)",
            textDecoration: "none",
          }}
        >
          ← search
        </a>
        <h1
          style={{
            fontSize: "1.5rem",
            fontWeight: 600,
            marginTop: "1rem",
            marginBottom: "0.25rem",
          }}
        >
          Browse by Frequency
        </h1>
        {count && (
          <p
            style={{
              fontFamily: '"Inter", sans-serif',
              fontSize: "0.875rem",
              color: "var(--text-secondary)",
            }}
          >
            {count.toLocaleString()} unique words indexed · page {page} of {totalPages}
          </p>
        )}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr
            style={{
              fontFamily: '"Inter", sans-serif',
              fontSize: "0.8rem",
              color: "var(--text-secondary)",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              borderBottom: "2px solid var(--border)",
            }}
          >
            <th style={{ textAlign: "left", padding: "0.5rem 0.75rem 0.5rem 0" }}>#</th>
            <th style={{ textAlign: "left", padding: "0.5rem 0.75rem" }}>Word</th>
            <th style={{ textAlign: "right", padding: "0.5rem 0 0.5rem 0.75rem" }}>
              Occurrences
            </th>
          </tr>
        </thead>
        <tbody>
          {words?.map((word, i) => (
            <tr
              key={word.id}
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <td
                style={{
                  padding: "0.65rem 0.75rem 0.65rem 0",
                  fontFamily: '"Inter", sans-serif',
                  fontSize: "0.8rem",
                  color: "var(--text-secondary)",
                }}
              >
                {from + i + 1}
              </td>
              <td style={{ padding: "0.65rem 0.75rem" }}>
                <a
                  className="gurmukhi-lg"
                  href={`/word/${encodeURIComponent(word.gurmukhi)}`}
                  style={{ color: "var(--text-primary)", textDecoration: "none" }}
                >
                  {word.gurmukhi}
                </a>
              </td>
              <td
                style={{
                  textAlign: "right",
                  padding: "0.65rem 0 0.65rem 0.75rem",
                  fontFamily: '"Inter", sans-serif',
                  fontSize: "0.9rem",
                  color: "var(--text-secondary)",
                }}
              >
                {word.frequency.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pagination */}
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          justifyContent: "center",
          marginTop: "2rem",
          fontFamily: '"Inter", sans-serif',
          fontSize: "0.9rem",
        }}
      >
        {page > 1 && (
          <a href={`/browse?page=${page - 1}`} style={{ color: "var(--accent)" }}>
            ← Previous
          </a>
        )}
        <span style={{ color: "var(--text-secondary)" }}>
          {page} / {totalPages}
        </span>
        {page < totalPages && (
          <a href={`/browse?page=${page + 1}`} style={{ color: "var(--accent)" }}>
            Next →
          </a>
        )}
      </div>
    </div>
  );
}
