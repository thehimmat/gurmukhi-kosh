import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sources & Licensing — Gurmukhi Kosh",
  description:
    "Where every datum in Gurmukhi Kosh comes from, and the scholarly sources we cite, use, and plan to use.",
};

type Status = "in-use" | "pending-permission" | "pending-terms";

const STATUS_LABEL: Record<Status, string> = {
  "in-use": "In use",
  "pending-permission": "Planned · pending permission",
  "pending-terms": "Under consideration · pending terms",
};

const STATUS_STYLE: Record<Status, { bg: string; fg: string }> = {
  "in-use": { bg: "var(--accent-light)", fg: "var(--accent)" },
  "pending-permission": { bg: "#f3ece1", fg: "#7a5a2e" },
  "pending-terms": { bg: "#eee9e2", fg: "#5c534d" },
};

function StatusPill({ status }: { status: Status }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: '"Inter", sans-serif',
        fontSize: "0.72rem",
        fontWeight: 600,
        letterSpacing: "0.01em",
        padding: "0.15rem 0.5rem",
        borderRadius: "999px",
        backgroundColor: s.bg,
        color: s.fg,
        whiteSpace: "nowrap",
      }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

type Source = {
  name: string;
  role: string;
  status: Status;
  url?: string;
  note?: string;
};

const SOURCES: Source[] = [
  {
    name: "BaniDB (Khalis Foundation)",
    role: "Scripture text, line metadata, and per-line commentaries.",
    status: "in-use",
    url: "https://banidb.com",
    note: "Licensed CC BY-NC-SA 3.0 — non-commercial, share-alike. Carries the Darpan, pad-arth, Faridkot Teeka, and Manmohan Singh readings shown under each word.",
  },
  {
    name: "Mahan Kosh (Bhai Kahn Singh Nabha, 1930)",
    role: "Encyclopedic definitions and the part-of-speech markers we extract.",
    status: "in-use",
    url: "https://www.searchgurbani.com/sggs-kosh",
    note: "Underlying work is from the public-domain era; the digitization is sourced from searchgurbani.com.",
  },
  {
    name: "Sri Guru Granth Sahib Darpan & pad-arth (Prof. Sahib Singh)",
    role: "Per-line grammatical analysis; the cited basis for sourced grammar facts.",
    status: "in-use",
    url: "https://www.gurugranthdarpan.net/",
    note: "Shown verbatim in the original Punjabi, never machine-translated. Mined only for grammar statements the scholar makes explicitly.",
  },
  {
    name: "Monier-Williams Sanskrit-English Dictionary (1899)",
    role: "Cited glosses for Sanskrit roots on the etymology tab.",
    status: "in-use",
    url: "https://www.sanskrit-lexicon.uni-koeln.de/scans/MWScan/2020/web/index.php",
    note: "Public domain. Looked up per root via the Cologne Digital Sanskrit Dictionaries (C-SALT) API, University of Cologne.",
  },
  {
    name: "Steingass, A Comprehensive Persian-English Dictionary (1892)",
    role: "Cited glosses for Persian and Arabic roots on the etymology tab.",
    status: "in-use",
    url: "https://dsal.uchicago.edu/dictionaries/steingass/",
    note: "The 1892 work is public domain; the digitization is served by the Digital Dictionaries of South Asia (University of Chicago), whose pages carry a CC BY-NC-ND notice. We use attributed per-word glosses only, strictly non-commercially, have notified DSAL of this use, and will remove the glosses on their request.",
  },
  {
    name: "Platts, A Dictionary of Urdu, Classical Hindi, and English (1884)",
    role: "Cited glosses for Urdu (and some Arabic) roots on the etymology tab.",
    status: "in-use",
    url: "https://dsal.uchicago.edu/dictionaries/platts/",
    note: "Same basis as Steingass above: public-domain work, DSAL digitization, attributed per-word glosses only, removable on request.",
  },
  {
    name: "The Guru Granth Sahib Dictionary (SikhRI)",
    role: "Per-word meanings and grammar — the strongest candidate for citable, scholar-verified grammar.",
    status: "pending-permission",
    url: "https://gurugranthsahibdictionary.io",
    note: "© SikhRI, all rights reserved. A permission request to use and cite this data, free and strictly non-commercial with full attribution, has been sent. We will not ingest any of it until SikhRI agrees.",
  },
  {
    name: "Sri Granth Gurbani Dictionary (Dr. Kulbir S. Thind & Dr. Gurcharan Singh)",
    role: "A second definitions source that also carries part-of-speech markers.",
    status: "pending-terms",
    url: "https://srigranth.org/servlet/gurbani.dictionary",
    note: "© SriGranth.org, all rights reserved — not openly licensed. We are confirming terms before any use.",
  },
  {
    name: "Guru Granth Kosh (Dr. Gurcharan Singh)",
    role: "A focused SGGS Punjabi-to-Punjabi dictionary, hosted alongside Mahan Kosh.",
    status: "pending-terms",
    url: "https://www.searchgurbani.com/guru-granth-kosh",
    note: "Modern authored work; copyright likely still held. We are confirming terms before any use.",
  },
];

function SourceRow({ source }: { source: Source }) {
  return (
    <div
      style={{
        borderTop: "1px solid var(--border)",
        padding: "1.25rem 0",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "baseline",
          gap: "0.6rem",
          marginBottom: "0.35rem",
        }}
      >
        <h3
          style={{
            fontFamily: '"Crimson Pro", Georgia, serif',
            fontSize: "1.15rem",
            fontWeight: 600,
            margin: 0,
          }}
        >
          {source.url ? (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--text-primary)", textDecoration: "none" }}
            >
              {source.name}
            </a>
          ) : (
            source.name
          )}
        </h3>
        <StatusPill status={source.status} />
      </div>
      <p
        style={{
          fontFamily: '"Inter", sans-serif',
          fontSize: "0.9rem",
          color: "var(--text-primary)",
          margin: "0 0 0.35rem",
        }}
      >
        {source.role}
      </p>
      {source.note && (
        <p
          style={{
            fontFamily: '"Inter", sans-serif',
            fontSize: "0.85rem",
            color: "var(--text-secondary)",
            margin: 0,
            lineHeight: 1.55,
          }}
        >
          {source.note}
        </p>
      )}
    </div>
  );
}

export default function AboutPage() {
  return (
    <div style={{ maxWidth: "860px", margin: "0 auto", padding: "3rem 1.5rem" }}>
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
          fontSize: "1.6rem",
          fontWeight: 600,
          marginTop: "1rem",
          marginBottom: "0.5rem",
        }}
      >
        Sources &amp; Licensing
      </h1>

      <p
        style={{
          fontFamily: '"Inter", sans-serif',
          fontSize: "0.95rem",
          color: "var(--text-secondary)",
          lineHeight: 1.6,
          maxWidth: "62ch",
        }}
      >
        Every datum in an entry should come from a verifiable, well-established
        scholarly source that we cite to you, or be clearly labelled as our
        best-judgment inference. We never present inference as authoritative
        fact. Gurmukhi Kosh is entirely free and strictly non-commercial.
      </p>

      <section style={{ marginTop: "2.5rem" }}>
        <h2
          style={{
            fontFamily: '"Inter", sans-serif',
            fontSize: "0.8rem",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--text-secondary)",
            marginBottom: "0.25rem",
          }}
        >
          Sources
        </h2>
        {SOURCES.map((s) => (
          <SourceRow key={s.name} source={s} />
        ))}
      </section>

      <p
        style={{
          fontFamily: '"Inter", sans-serif',
          fontSize: "0.82rem",
          color: "var(--text-secondary)",
          lineHeight: 1.6,
          marginTop: "2rem",
          paddingTop: "1.5rem",
          borderTop: "1px solid var(--border)",
          maxWidth: "62ch",
        }}
      >
        Grammar that is computed from established rules rather than read directly
        from a source is shown as rule-derived best judgment, with its
        confidence and the rule it applies, never as a citation. Where two
        sources disagree, we lead with the cited scholar and flag the
        difference.
      </p>
    </div>
  );
}
