import type { Metadata } from "next";
import { Crimson_Pro, Inter } from "next/font/google";
import "./globals.css";

const crimsonPro = Crimson_Pro({
  variable: "--font-crimson-pro",
  subsets: ["latin"],
  weight: ["400", "600"],
  style: ["normal", "italic"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Gurmukhi Kosh — ਗੁਰਮੁਖੀ ਕੋਸ਼",
  description: "A comprehensive dictionary of Gurmukhi words from Sri Guru Granth Sahib Ji, with references and translations.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pa" className={`${crimsonPro.variable} ${inter.variable}`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+Gurmukhi:wght@400;500;600;700&display=swap"
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
              alignItems: "baseline",
              gap: "1rem",
            }}
          >
            <a
              href="/"
              style={{
                fontFamily: '"Crimson Pro", Georgia, serif',
                fontSize: "1.35rem",
                fontWeight: 600,
                color: "var(--text-primary)",
                textDecoration: "none",
              }}
            >
              Gurmukhi Kosh
            </a>
            <span
              className="gurmukhi"
              style={{ fontSize: "1.1rem", color: "var(--text-secondary)" }}
            >
              ਗੁਰਮੁਖੀ ਕੋਸ਼
            </span>
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
          <p>
            Word data from{" "}
            <a href="https://banidb.com" target="_blank" rel="noopener noreferrer">
              BaniDB
            </a>{" "}
            · Sri Guru Granth Sahib Ji
          </p>
          <p style={{ marginTop: "0.5rem" }}>
            <a href="/about" style={{ color: "var(--accent)", textDecoration: "none" }}>
              Sources &amp; licensing
            </a>
            {" · "}
            <a href="/health" style={{ color: "var(--accent)", textDecoration: "none" }}>
              Data health
            </a>
          </p>
        </footer>
      </body>
    </html>
  );
}
