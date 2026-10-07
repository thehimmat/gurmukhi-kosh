"use client";

import { usePathname } from "next/navigation";
import { gurbaniSearchHref, wordFromPath } from "@/lib/word-path";

// An unknown word (#126): say which word, then offer the two useful next
// steps instead of a bare 404. Not-found pages get no params, hence the path.
export default function WordNotFound() {
  const word = wordFromPath(usePathname() ?? "");
  return (
    <div style={{ maxWidth: "860px", margin: "0 auto", padding: "3rem 1.5rem" }}>
      <a href="/" style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.875rem", color: "var(--text-secondary)", textDecoration: "none", display: "inline-block", marginBottom: "2rem" }}>
        ← Back to search
      </a>
      {word && <h1 className="gurmukhi-xl" style={{ marginBottom: "0.5rem" }}>{word}</h1>}
      <p style={{ fontSize: "1.15rem", marginBottom: "1.5rem" }}>
        {word ? "There is no dictionary entry for this word." : "There is no dictionary entry here."}
      </p>
      <ul style={{ fontFamily: '"Inter", sans-serif', fontSize: "0.95rem", lineHeight: 2, paddingLeft: "1.2rem", margin: 0, listStyle: "disc" }}>
        {word && (
          <li>
            <a href={gurbaniSearchHref(word)}>Search Gurbani for <span className="gurmukhi">{word}</span></a>
            {" "}— it may appear in a line under a different spelling
          </li>
        )}
        <li><a href="/browse">Browse every word by frequency</a></li>
      </ul>
    </div>
  );
}
