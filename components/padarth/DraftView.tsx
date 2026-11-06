// The pad-arth builder's read-only draft (#23): each line, then every word with every candidate
// gloss and its grammar, then the phrases a source defines, then entries placed on no word.
// Server-rendered; picking (PR 5) adds the interaction on top of this markup.

import type { Candidate, DraftLine, DraftWord, GrammarNote } from "@/lib/padarth/draft";
import type { LineRow } from "@/lib/padarth/fetch";
import { withCuratorKey } from "@/lib/curator";

const SOURCE_LABEL: Record<string, string> = {
  ss_padarth: "Sahib Singh",
  shackle: "Shackle",
  mahan_kosh: "Mahan Kosh",
  sikhri: "SikhRI",
  manual: "Manual",
};
const sourceLabel = (code: string) => SOURCE_LABEL[code] ?? code;

const CASE_LABEL: Record<string, string> = {
  genitive: "genitive",
  locative: "locative",
  instrumental: "instrumental",
  ablative: "ablative",
  objective: "objective",
  agentive: "agentive",
  vocative: "vocative",
};

const ATTRIBUTE_LABEL: Record<string, string> = {
  pos: "part of speech",
  gender: "gender",
  number: "number",
  gramCase: "case",
  person: "person",
  verbForm: "verb form",
};

function GrammarNoteView({ note }: { note: GrammarNote }) {
  if (note.tier === "clue") {
    return (
      <li className="padarth-grammar padarth-clue">
        {CASE_LABEL[note.gramCase] ?? note.gramCase}? Sahib Singh glosses <span className="gurmukhi">‘{note.basis}’</span>
      </li>
    );
  }
  if (note.kind === "form_label") {
    return (
      <li className="padarth-grammar">
        ({note.text} of <span className="gurmukhi">{note.headword}</span>) <span className="padarth-source">{sourceLabel(note.sourceCode)}</span>
      </li>
    );
  }
  return (
    <li className="padarth-grammar">
      ({note.facts.map((f) => `${ATTRIBUTE_LABEL[f.attribute] ?? f.attribute}: ${f.value}`).join("; ")}){" "}
      <span className="padarth-source">{sourceLabel(note.sourceCode)}</span>
    </li>
  );
}

function CandidateView({ c }: { c: Candidate }) {
  if (c.kind === "padarth_gloss") {
    return (
      <li className="padarth-candidate">
        <span className="gurmukhi">{c.text}</span> <span className="padarth-source">{sourceLabel(c.sourceCode)}</span>
        {c.match === "via_base" && <span className="padarth-caveat"> through a Shackle paradigm (gloss written for ‘{c.term}’)</span>}
        {c.notes.length > 0 && (
          <ul className="padarth-notes">
            {c.notes.map((n, i) => (
              <li key={i} className="gurmukhi">
                {n}
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  }
  return (
    <li className={c.lowPriority ? "padarth-candidate padarth-low" : "padarth-candidate"}>
      <span>{c.text}</span>
      {c.textEn && <span className="padarth-en"> — {c.textEn}</span>}{" "}
      <span className="padarth-source">
        {c.via ? (
          <>
            via <span className="gurmukhi">{c.via.headword}</span>, {sourceLabel(c.sourceCode)}
          </>
        ) : (
          sourceLabel(c.sourceCode)
        )}
        {c.senseNumber !== null && ` §${c.senseNumber}`}
      </span>
      {c.lowPriority && <span className="padarth-caveat"> spelling rebuilt from Shackle&apos;s romanisation</span>}
    </li>
  );
}

function WordView({ w, inPhrase, curatorKey }: { w: DraftWord; inPhrase: boolean; curatorKey: string }) {
  return (
    <li className="padarth-word">
      <a className="gurmukhi padarth-term" href={withCuratorKey(`/word/${encodeURIComponent(w.gurmukhi)}`, curatorKey)}>
        {w.gurmukhi}
      </a>
      {w.grammar.length > 0 && (
        <ul className="padarth-grammar-list">
          {w.grammar.map((g, i) => (
            <GrammarNoteView key={i} note={g} />
          ))}
        </ul>
      )}
      {w.uncovered ? (
        <p className="padarth-uncovered">{inPhrase ? "Glossed in a phrase below." : "No gloss in the database."}</p>
      ) : (
        <ul className="padarth-candidates">
          {w.candidates.map((c) => (
            <CandidateView key={`${c.kind}:${c.kind === "padarth_gloss" ? c.glossId : c.definitionId}`} c={c} />
          ))}
        </ul>
      )}
    </li>
  );
}

function LineDraftView({ line, draft, curatorKey }: { line: LineRow; draft: DraftLine; curatorKey: string }) {
  const phrasePositions = new Set(draft.phrases.flatMap((p) => p.positions));
  return (
    <section className="padarth-line card">
      <p className="gurmukhi-lg padarth-verse">
        <a href={withCuratorKey(`/admin/line/${line.id}`, curatorKey)}>{line.gurmukhi}</a>
      </p>
      <ol className="padarth-words">
        {draft.words.map((w) => (
          <WordView key={w.position} w={w} inPhrase={phrasePositions.has(w.position)} curatorKey={curatorKey} />
        ))}
      </ol>
      {draft.phrases.length > 0 && (
        <>
          <h4 className="padarth-heading">Phrases</h4>
          <ol className="padarth-words">
            {draft.phrases.map((p) => (
              <li key={p.positions.join(",")} className="padarth-word">
                <span className="gurmukhi padarth-term">{p.surface}</span>
                {p.grammar.length > 0 && (
                  <ul className="padarth-grammar-list">
                    {p.grammar.map((g, i) => (
                      <GrammarNoteView key={i} note={g} />
                    ))}
                  </ul>
                )}
                <ul className="padarth-candidates">
                  {p.candidates.map((c) => (
                    <CandidateView key={c.glossId} c={c} />
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </>
      )}
      {draft.unplaced.length > 0 && (
        <details className="padarth-unplaced">
          <summary>Not placed on a word ({draft.unplaced.length})</summary>
          <ul>
            {draft.unplaced.map((g) => (
              <li key={g.id} className="gurmukhi">
                {g.term} = {g.gloss}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export function PadarthDraftView({ lines, drafts, curatorKey }: { lines: LineRow[]; drafts: DraftLine[]; curatorKey: string }) {
  const byId = new Map(lines.map((l) => [l.id, l]));
  return (
    <div className="padarth-draft">
      {drafts.map((d) => {
        const line = byId.get(d.lineId);
        return line ? <LineDraftView key={d.lineId} line={line} draft={d} curatorKey={curatorKey} /> : null;
      })}
    </div>
  );
}
