"use client";

import { useEffect } from "react";

// Shown when a page fails to render (#126), e.g. a database timeout. Keeps
// the site's layout and offers a retry instead of Next's default error page.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div style={{ maxWidth: "860px", margin: "0 auto", padding: "3rem 1.5rem" }}>
      <h1 style={{ fontSize: "1.6rem", marginBottom: "0.75rem" }}>Something went wrong</h1>
      <p style={{ marginBottom: "1.5rem" }}>
        This page couldn&apos;t load just now. It&apos;s usually temporary, so please try again.
      </p>
      <div style={{ display: "flex", gap: "1rem", alignItems: "center", fontFamily: '"Inter", sans-serif' }}>
        <button
          type="button"
          onClick={reset}
          style={{ padding: "0.5rem 1.1rem", background: "var(--accent)", color: "white", border: "none", borderRadius: "6px", fontSize: "0.9rem", fontWeight: 600, cursor: "pointer" }}
        >
          Try again
        </button>
        <a href="/" style={{ fontSize: "0.9rem" }}>Back to search</a>
      </div>
      {error.digest && (
        <p style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "1.5rem" }}>
          Reference: {error.digest}
        </p>
      )}
    </div>
  );
}
