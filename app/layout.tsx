import type { Metadata } from "next";
import { CORPORA, SITE_NAME_EN, SITE_NAME_PA } from "@/lib/site";
import { SiteNav } from "@/components/SiteNav";
import "./globals.css";

export const metadata: Metadata = {
  title: `${SITE_NAME_PA} — ${SITE_NAME_EN}`,
  description: "A comprehensive dictionary of Gurmukhi words from Sri Guru Granth Sahib Ji, with references and translations.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pa">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* One Google Fonts request, matching the gurmukhi-search shell so both
            zones share cached fonts. Styles name these families literally, which
            next/font's hashed names never matched (#123). */}
        <link
          href="https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,600;1,400&family=Inter:wght@400;500;600&family=Noto+Sans+Gurmukhi:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen flex flex-col">
        <header
          style={{
            borderBottom: "1px solid var(--border)",
            backgroundColor: "white",
          }}
        >
          <div
            style={{
              maxWidth: "860px",
              margin: "0 auto",
              padding: "1rem 1.5rem",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: "0.5rem 1rem",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "0 0.75rem", whiteSpace: "nowrap" }}>
            <a
              href="/"
              className="gurmukhi"
              style={{
                fontSize: "1.3rem",
                fontWeight: 600,
                color: "var(--text-primary)",
                textDecoration: "none",
              }}
            >
              {SITE_NAME_PA}
            </a>
            <span
              style={{
                fontFamily: '"Crimson Pro", Georgia, serif',
                fontSize: "1.1rem",
                color: "var(--text-secondary)",
              }}
            >
              {SITE_NAME_EN}
            </span>
            </div>
            <SiteNav />
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer
          style={{
            borderTop: "1px solid var(--border)",
            padding: "2rem 1.5rem",
            textAlign: "center",
            color: "var(--text-secondary)",
            fontSize: "0.9rem",
            fontFamily: '"Inter", sans-serif',
          }}
        >
          <p>{CORPORA.join(" · ")}</p>
          <p style={{ marginTop: "0.5rem" }}>
            <a href="/about" style={{ color: "var(--accent)", textDecoration: "none" }}>
              Sources &amp; licensing
            </a>
            {" · "}
            <a href="https://apps.atthebunga.com" style={{ color: "var(--accent)", textDecoration: "none" }}>
              More tools at apps.atthebunga.com
            </a>
          </p>
        </footer>
      </body>
    </html>
  );
}
