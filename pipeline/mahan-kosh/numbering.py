#!/usr/bin/env python3
"""Repair repeated Mahan Kosh sense numbers before splitting (#159).

scrape.py numbers each sense from the printed numeral, and the source has
typos that give two senses of one word the same number, which ingest.ts
would collapse to one row:

  ਵੇਕਾਰ  1, 2, 2, 4      a numeral repeated where the next one belongs
  ਭਰ     …, 7, 8, 4      a numeral that runs backwards
  ਕਲੇਸ   1-5, then 2-5   senses printed twice, word for word

Senses are renumbered by position, keeping the printed numeral in
`printed_number` so the repair is reversible:
  - a sense whose text repeats an earlier sense of the word is dropped;
  - two senses with the same number where one is a fuller printing of the
    other (same opening sentence; ਕਲੇਸ prints its entry twice) become one,
    keeping the fuller text;
  - a number that does not increase becomes the previous number + 1 when no
    later sense holds that number;
  - when no number is free (1, 2, 2, 3) the sense is merged into the one
    before it, so no text is lost.

Gaps are left alone: the #140 splitter fills them from inline numerals.
"""


def _same_text(a, b):
    def key(t):
        return (t or "").strip().rstrip(".। ").strip()
    return key(a) == key(b)


MIN_OPENING = 15  # chars; shorter openings ("ਸੰ. ਵ…") are not evidence


def _opening(text):
    """The sense's first sentence: the text before its first '#' break."""
    return (text or "").split("#", 1)[0].strip()


def _same_printing(a, b):
    """True when the shorter text's opening sentence also opens the longer:
    the same sense printed twice, once cut short."""
    short, full = sorted((a or "", b or ""), key=len)
    head = _opening(short)
    return len(head) >= MIN_OPENING and full.strip().startswith(head)


def _restarts_entry(text, first_sense):
    """The cut-short printing breaks off and starts the entry again: its text
    after the first '#' is the word's first sense ('…ਲਿਖੇ ਹਨ.#ਸੰ. ਕ੍ਲੇਸ਼…')."""
    tail = (text or "").split("#", 1)[1].strip() if "#" in (text or "") else ""
    head = _opening(first_sense)
    return bool(tail) and len(head) >= MIN_OPENING and tail.startswith(head)


def _fuller(a, b, first_sense):
    """Of two printings of one sense, the one that does not break off into a
    restart of the entry; failing that, the longer."""
    ra = _restarts_entry(a.get("definition_text"), first_sense)
    rb = _restarts_entry(b.get("definition_text"), first_sense)
    if ra != rb:
        return b if ra else a
    return max(a, b, key=lambda t: len(t.get("definition_text") or ""))


def repair_numbering(headword, senses):
    """Returns (senses, notes): a repaired copy of `senses` (in order) and
    one note per sense dropped, renumbered or merged."""
    notes = []
    out = []

    def note(kind, s, **extra):
        notes.append({"kind": kind, "headword": headword,
                      "sense_number": s["sense_number"], **extra})

    for i, s in enumerate(senses):
        if any(_same_text(s.get("definition_text"), o.get("definition_text")) for o in out):
            note("duplicate_text_dropped", s)
            continue
        prev = out[-1]["sense_number"] if out else 0
        n = s["sense_number"]
        if out and n == prev and _same_printing(out[-1].get("definition_text"), s.get("definition_text")):
            fuller = _fuller(out[-1], s, out[0].get("definition_text"))
            out[-1] = dict(out[-1], definition_text=fuller.get("definition_text"))
            note("fuller_printing_kept", s)
            continue
        if n > prev:
            out.append(s)
            continue
        wanted = prev + 1
        taken = any(t["sense_number"] == wanted for t in senses[i + 1:])
        if not taken:
            out.append(dict(s, sense_number=wanted, printed_number=s.get("printed_number", n)))
            note("renumbered", s, renumbered_to=wanted)
            continue
        merged = out[-1]
        out[-1] = dict(merged, definition_text=(
            f'{(merged.get("definition_text") or "").rstrip()} {(s.get("definition_text") or "").strip()}'))
        note("merged_no_room", s, merged_into=merged["sense_number"])
    return out, notes
