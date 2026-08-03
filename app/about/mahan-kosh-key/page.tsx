import type { Metadata } from "next";
import legendJson from "@/pipeline/mahan-kosh/abbreviations.json";

export const metadata: Metadata = {
  title: "Mahan Kosh Key (ਸੰਕੇਤ) — Gurmukhi Kosh",
  description:
    "A plain-English key to the shorthand inside Mahan Kosh entries: part-of-speech markers, language markers, citation abbreviations, and letter signs, with the original Gurmukhi and the provenance of every reading.",
};

/* ---------------------------------------------------------------- types */

type EntrySource = "front_matter" | "corpus";

interface MarkerEntry {
  abbr: string;
  variants?: string[];
  gurmukhi?: string;
  english: string;
  source: EntrySource;
  note?: string;
  iso639?: string | null;
}

interface FrameEntry {
  frame: string;
  english: string;
  attribute: string;
  source: EntrySource;
  note?: string;
}

interface DiscourseEntry {
  abbr: string;
  variants?: string[];
  english: string;
  role: string;
  source: EntrySource;
}

interface CitationToken {
  abbr: string;
  variants?: string[];
  gurmukhi?: string;
  english: string;
  source: EntrySource;
}

interface WorkEntry {
  abbr: string;
  variants?: string[];
  work?: string;
  raag?: string;
  gurmukhi?: string;
  english?: string;
  source: EntrySource;
}

interface DeprecatedEntry {
  abbr: string;
  was_assumed: string;
  actually: string;
  resolved: string;
}

interface SignEntry {
  sign: string;
  represents: string;
  examples: string[];
  source: EntrySource;
}

interface ConventionEntry {
  convention: string;
  english: string;
  source: EntrySource;
  note?: string;
}

interface Legend {
  pos_markers: { entries: MarkerEntry[] };
  language_markers: {
    entries: MarkerEntry[];
    deprecated_non_canonical: DeprecatedEntry[];
  };
  grammar_annotations: { entries: FrameEntry[] };
  discourse_markers: { entries: DiscourseEntry[] };
  citation_grammar: { tokens: CitationToken[]; bhagat_authors: string[] };
  citation_sources: {
    sggs_raags: WorkEntry[];
    sggs_compositions: WorkEntry[];
    dasam_granth: WorkEntry[];
    other_works: WorkEntry[];
    date_and_person_markers: (WorkEntry & { english: string })[];
  };
  letter_signs: { perso_arabic: SignEntry[]; sanskrit: SignEntry[] };
  structural_conventions: { entries: ConventionEntry[] };
}

const legend = legendJson as unknown as Legend;

/* ------------------------------------------------------------ ui pieces */

const inter = '"Inter", sans-serif';
const serif = '"Crimson Pro", Georgia, serif';

function SourceBadge({ source }: { source: EntrySource }) {
  const printed = source === "front_matter";
  return (
    <span
      title={
        printed
          ? "Listed in the abbreviation tables printed in the 1930 front matter"
          : "Not in the printed key; our reading, inferred from consistent usage in the corpus"
      }
      style={{
        display: "inline-block",
        fontFamily: inter,
        fontSize: "0.68rem",
        fontWeight: 600,
        letterSpacing: "0.01em",
        padding: "0.1rem 0.45rem",
        borderRadius: "999px",
        whiteSpace: "nowrap",
        backgroundColor: printed ? "var(--accent-light)" : "#f3ece1",
        color: printed ? "var(--accent)" : "#7a5a2e",
      }}
    >
      {printed ? "Printed key, 1930" : "Inferred by us"}
    </span>
  );
}

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      style={{
        fontFamily: serif,
        fontSize: "1.35rem",
        fontWeight: 600,
        marginTop: "3rem",
        marginBottom: "0.4rem",
        scrollMarginTop: "1rem",
      }}
    >
      {children}
    </h2>
  );
}

function Blurb({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontFamily: inter,
        fontSize: "0.9rem",
        color: "var(--text-secondary)",
        lineHeight: 1.6,
        maxWidth: "68ch",
        margin: "0 0 1rem",
      }}
    >
      {children}
    </p>
  );
}

interface Row {
  abbr: string;
  variants?: string[];
  sub?: string;
  english: string;
  source: EntrySource;
  note?: string;
}

function KeyTable({ rows, abbrHeader = "Shorthand" }: { rows: Row[]; abbrHeader?: string }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontFamily: inter,
          fontSize: "0.88rem",
        }}
      >
        <thead>
          <tr>
            {[abbrHeader, "Meaning", "Basis"].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--text-secondary)",
                  padding: "0.4rem 0.75rem 0.4rem 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.abbr + r.english}>
              <td
                style={{
                  padding: "0.5rem 1rem 0.5rem 0",
                  borderBottom: "1px solid var(--border)",
                  whiteSpace: "nowrap",
                  verticalAlign: "top",
                }}
              >
                <span className="gurmukhi" style={{ fontSize: "1.05rem" }}>
                  {r.abbr}
                </span>
                {r.variants && r.variants.length > 0 && (
                  <span
                    className="gurmukhi"
                    style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}
                  >
                    {" "}
                    ({r.variants.join(", ")})
                  </span>
                )}
                {r.sub && (
                  <div
                    className="gurmukhi"
                    style={{ color: "var(--text-secondary)", fontSize: "0.82rem" }}
                  >
                    {r.sub}
                  </div>
                )}
              </td>
              <td
                style={{
                  padding: "0.5rem 1rem 0.5rem 0",
                  borderBottom: "1px solid var(--border)",
                  verticalAlign: "top",
                  lineHeight: 1.5,
                }}
              >
                {r.english}
                {r.note && (
                  <div style={{ color: "var(--text-secondary)", fontSize: "0.8rem", marginTop: "0.15rem" }}>
                    {r.note}
                  </div>
                )}
              </td>
              <td
                style={{
                  padding: "0.5rem 0",
                  borderBottom: "1px solid var(--border)",
                  verticalAlign: "top",
                }}
              >
                <SourceBadge source={r.source} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------------------------------------------- page */

export default function MahanKoshKeyPage() {
  const L = legend;

  return (
    <div style={{ maxWidth: "860px", margin: "0 auto", padding: "3rem 1.5rem" }}>
      <a
        href="/about"
        style={{
          fontFamily: inter,
          fontSize: "0.875rem",
          color: "var(--text-secondary)",
          textDecoration: "none",
        }}
      >
        ← sources &amp; licensing
      </a>

      <h1 style={{ fontSize: "1.6rem", fontWeight: 600, marginTop: "1rem", marginBottom: "0.5rem" }}>
        The Mahan Kosh Key <span className="gurmukhi">(ਸੰਕੇਤ)</span>
      </h1>

      <Blurb>
        Mahan Kosh, Bhai Kahn Singh Nabha&apos;s 1930 encyclopedia of Sikh literature, writes its
        entries in a dense scholarly shorthand: two or three Gurmukhi letters can name a language,
        a part of speech, or one of dozens of source texts. This page decodes that shorthand in
        plain English, alongside the original Gurmukhi.
      </Blurb>
      <Blurb>
        Every row shows its basis. <SourceBadge source="front_matter" /> means the reading comes from
        the abbreviation tables Kahn Singh printed in the book&apos;s own front matter
        (ਮਹਾਨਕੋਸ਼ ਦੇ ਪਤਿਆਂ ਦੇ ਸੰਖੇਪ ਸੰਕੇਤ and ਅੱਖਰਾਂ ਦੇ ਸੰਕੇਤ), which we transcribed and verified
        against the{" "}
        <a
          href="https://pa.wikisource.org/wiki/%E0%A8%AA%E0%A9%B0%E0%A8%A8%E0%A8%BE:%E0%A8%AE%E0%A8%B9%E0%A8%BE%E0%A8%A8_%E0%A8%95%E0%A9%8B%E0%A8%B8%E0%A8%BC_%E0%A8%AD%E0%A8%BE%E0%A8%97_1.pdf/19"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--accent)" }}
        >
          Bhasha Vibhag scan on Punjabi Wikisource
        </a>
        . <SourceBadge source="corpus" /> means the printed key does not list it: the reading is our
        inference from how the notation is used consistently across the 12,772 entries in our copy.
        Inferred rows are assumptions, shown here so you can check them.
      </Blurb>

      {/* worked example */}
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: "8px",
          padding: "1.1rem 1.25rem",
          margin: "1.75rem 0 0.5rem",
          backgroundColor: "var(--accent-light, #f7f2ea)",
        }}
      >
        <div
          style={{
            fontFamily: inter,
            fontSize: "0.72rem",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--text-secondary)",
            marginBottom: "0.5rem",
          }}
        >
          How an entry reads
        </div>
        <p className="gurmukhi" style={{ fontSize: "1.05rem", margin: "0 0 0.6rem", lineHeight: 1.7 }}>
          ਸੰ. ਪਾਨੀਯ. ਸੰਗ੍ਯਾ- ਜਲ. &quot;ਪਾਣੀ ਅੰਦਿਰ ਲੀਕ ਜਿਉ.&quot; (ਵਾਰ ਆਸਾ ਮਃ ੨)
        </p>
        <p
          style={{
            fontFamily: inter,
            fontSize: "0.85rem",
            color: "var(--text-secondary)",
            lineHeight: 1.65,
            margin: 0,
          }}
        >
          From the entry for ਪਾਣੀ (water): <span className="gurmukhi">ਸੰ.</span> says the word comes
          from Sanskrit, and ਪਾਨੀਯ is the Sanskrit source form. <span className="gurmukhi">ਸੰਗ੍ਯਾ-</span>{" "}
          marks it as a noun. ਜਲ is the definition (a synonym: each gloss ends with a period). The
          quotation in curly quotes is a witness from scripture, and the parentheses cite it: the
          vaar in raag Asa, by Mahala 2 (Guru Angad).
        </p>
      </div>

      {/* POS */}
      <SectionHeading id="pos">Parts of speech and entry markers</SectionHeading>
      <Blurb>
        A marker with a trailing dash opens a sense and classifies the headword, for example{" "}
        <span className="gurmukhi">ਸੰਗ੍ਯਾ-</span> (noun) or <span className="gurmukhi">ਵਿ-</span>{" "}
        (adjective). One sense can switch to a different part of speech than the sense before it.
      </Blurb>
      <KeyTable
        rows={L.pos_markers.entries.map((e) => ({
          abbr: e.abbr + "-",
          variants: e.variants,
          sub: e.gurmukhi,
          english: e.english,
          source: e.source,
          note: e.note,
        }))}
      />

      {/* languages */}
      <SectionHeading id="languages">Language markers</SectionHeading>
      <Blurb>
        A short abbreviation ending in a period names the language a word comes from. After{" "}
        <span className="gurmukhi">ਸੰ.</span> the Sanskrit source often follows in Devanagari script;
        after <span className="gurmukhi">ਅ਼.</span>, <span className="gurmukhi">ਫ਼ਾ.</span> or{" "}
        <span className="gurmukhi">ਤੁ.</span> the original follows in Perso-Arabic script inside
        square brackets.
      </Blurb>
      <KeyTable
        rows={L.language_markers.entries.map((e) => ({
          abbr: e.abbr,
          variants: e.variants,
          sub: e.gurmukhi,
          english: e.english,
          source: e.source,
          note: e.note,
        }))}
      />

      <h3 style={{ fontFamily: serif, fontSize: "1.05rem", fontWeight: 600, margin: "1.75rem 0 0.4rem" }}>
        Markers we previously assumed, and what they really are
      </h3>
      <Blurb>
        Our first scraper guessed three markers that turned out not to exist in the printed key.
        We keep them listed here, with what the letter sequences actually are, so the correction is
        transparent.
      </Blurb>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: inter, fontSize: "0.88rem" }}>
          <thead>
            <tr>
              {["Shorthand", "We assumed", "It actually is"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--text-secondary)",
                    padding: "0.4rem 0.75rem 0.4rem 0",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {L.language_markers.deprecated_non_canonical.map((d) => (
              <tr key={d.abbr}>
                <td
                  className="gurmukhi"
                  style={{
                    padding: "0.5rem 1rem 0.5rem 0",
                    borderBottom: "1px solid var(--border)",
                    fontSize: "1.05rem",
                    whiteSpace: "nowrap",
                    verticalAlign: "top",
                  }}
                >
                  {d.abbr}
                </td>
                <td
                  style={{
                    padding: "0.5rem 1rem 0.5rem 0",
                    borderBottom: "1px solid var(--border)",
                    verticalAlign: "top",
                    color: "var(--text-secondary)",
                  }}
                >
                  {d.was_assumed}
                </td>
                <td
                  style={{
                    padding: "0.5rem 0",
                    borderBottom: "1px solid var(--border)",
                    verticalAlign: "top",
                    lineHeight: 1.5,
                  }}
                >
                  {d.actually}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* grammar frames */}
      <SectionHeading id="grammar">Grammar notes written in words</SectionHeading>
      <Blurb>
        Beyond the dash markers, Mahan Kosh states grammar in recurring phrases. X stands for the
        word being referred to.
      </Blurb>
      <KeyTable
        abbrHeader="Phrase"
        rows={L.grammar_annotations.entries.map((e) => ({
          abbr: e.frame,
          english: e.english,
          source: e.source,
          note: e.note,
        }))}
      />

      {/* discourse */}
      <SectionHeading id="prose">Prose markers</SectionHeading>
      <Blurb>Markers that structure the prose of a sense rather than classify the headword.</Blurb>
      <KeyTable
        rows={L.discourse_markers.entries.map((e) => ({
          abbr: e.abbr,
          variants: e.variants,
          english: e.english,
          source: e.source,
        }))}
      />

      {/* citations */}
      <SectionHeading id="citations">How citations work</SectionHeading>
      <Blurb>
        Nearly every sense is backed by a quotation in curly quotes, followed by its source in
        parentheses. A citation like <span className="gurmukhi">(ਵਾਰ ਮਾਝ ਮਃ ੧)</span> reads: the vaar
        in raag Majh, by Mahala 1 (Guru Nanak). These tokens combine inside the parentheses:
      </Blurb>
      <KeyTable
        rows={L.citation_grammar.tokens.map((e) => ({
          abbr: e.abbr,
          variants: e.variants,
          sub: e.gurmukhi,
          english: e.english,
          source: e.source,
        }))}
      />
      <Blurb>
        Bhagat and bard names appear as plain words in citations:{" "}
        <span className="gurmukhi">{L.citation_grammar.bhagat_authors.join(", ")}</span>.
      </Blurb>

      <h3 style={{ fontFamily: serif, fontSize: "1.05rem", fontWeight: 600, margin: "1.75rem 0 0.4rem" }}>
        Raag abbreviations (Sri Guru Granth Sahib)
      </h3>
      <Blurb>
        All 31 raag abbreviations appear in the printed key. The raag plus the mahala places a
        quotation inside the scripture.
      </Blurb>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
          gap: "0.3rem 1.25rem",
          fontFamily: inter,
          fontSize: "0.85rem",
          marginBottom: "0.5rem",
        }}
      >
        {L.citation_sources.sggs_raags.map((r) => (
          <div key={r.abbr} style={{ padding: "0.25rem 0", borderBottom: "1px solid var(--border)" }}>
            <span className="gurmukhi" style={{ fontSize: "1rem" }}>
              {r.abbr}
            </span>{" "}
            <span style={{ color: "var(--text-secondary)" }}>{r.raag}</span>
          </div>
        ))}
      </div>

      <h3 style={{ fontFamily: serif, fontSize: "1.05rem", fontWeight: 600, margin: "1.75rem 0 0.4rem" }}>
        Compositions cited by name (Sri Guru Granth Sahib)
      </h3>
      <KeyTable
        rows={L.citation_sources.sggs_compositions.map((e) => ({
          abbr: e.abbr,
          variants: e.variants,
          english: e.work ?? "",
          source: e.source,
        }))}
      />

      <h3 style={{ fontFamily: serif, fontSize: "1.05rem", fontWeight: 600, margin: "1.75rem 0 0.4rem" }}>
        Dasam Granth compositions
      </h3>
      <KeyTable
        rows={L.citation_sources.dasam_granth.map((e) => ({
          abbr: e.abbr,
          variants: e.variants,
          english: e.work ?? "",
          source: e.source,
        }))}
      />

      <h3 style={{ fontFamily: serif, fontSize: "1.05rem", fontWeight: 600, margin: "1.75rem 0 0.4rem" }}>
        Other works
      </h3>
      <KeyTable
        rows={L.citation_sources.other_works.map((e) => ({
          abbr: e.abbr,
          variants: e.variants,
          english: e.work ?? "",
          source: e.source,
        }))}
      />

      <h3 style={{ fontFamily: serif, fontSize: "1.05rem", fontWeight: 600, margin: "1.75rem 0 0.4rem" }}>
        Dates and life events
      </h3>
      <KeyTable
        rows={L.citation_sources.date_and_person_markers.map((e) => ({
          abbr: e.abbr,
          sub: e.gurmukhi,
          english: e.english,
          source: e.source,
        }))}
      />

      {/* letter signs */}
      <SectionHeading id="letter-signs">Letter signs (ਅੱਖਰਾਂ ਦੇ ਸੰਕੇਤ)</SectionHeading>
      <Blurb>
        Kahn Singh invented small marks on Gurmukhi letters, mostly a dot below (ਬਿੰਦੀ), to show the
        exact sound of a borrowed word&apos;s source language. The dot on{" "}
        <span className="gurmukhi">ਅ਼</span> is why the Arabic language marker looks the way it does:
        it is the letter for the Arabic sound ʿain. Our digitized text preserves many of these
        marks, and they carry real etymological information.
      </Blurb>
      <KeyTable
        abbrHeader="Sign"
        rows={L.letter_signs.perso_arabic.map((e) => ({
          abbr: e.sign,
          english: e.represents,
          source: e.source,
          note: e.examples.length ? "Example: " + e.examples.join(", ") : undefined,
        }))}
      />
      <h3 style={{ fontFamily: serif, fontSize: "1.05rem", fontWeight: 600, margin: "1.75rem 0 0.4rem" }}>
        Sanskrit signs
      </h3>
      <KeyTable
        abbrHeader="Sign"
        rows={L.letter_signs.sanskrit.map((e) => ({
          abbr: e.sign,
          english: e.represents,
          source: e.source,
          note: e.examples.length ? "Example: " + e.examples.join(", ") : undefined,
        }))}
      />

      {/* structure */}
      <SectionHeading id="structure">Structure of an entry</SectionHeading>
      <KeyTable
        abbrHeader="Convention"
        rows={L.structural_conventions.entries.map((e) => ({
          abbr: e.convention,
          english: e.english,
          source: e.source,
          note: e.note,
        }))}
      />

      <p
        style={{
          fontFamily: inter,
          fontSize: "0.82rem",
          color: "var(--text-secondary)",
          lineHeight: 1.6,
          marginTop: "2.5rem",
          paddingTop: "1.5rem",
          borderTop: "1px solid var(--border)",
          maxWidth: "68ch",
        }}
      >
        This page renders directly from the same machine-readable key our ingestion pipeline uses
        (
        <a
          href="https://github.com/thehimmat/gurmukhi-kosh/blob/main/pipeline/mahan-kosh/abbreviations.json"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--accent)" }}
        >
          abbreviations.json
        </a>
        ), so what you read here is exactly what the software assumes. Corrections are welcome:
        every word page has a flag button.
      </p>
    </div>
  );
}
