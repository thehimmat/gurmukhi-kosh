#!/usr/bin/env python3
"""Split Mahan Kosh rows that carry several numbered senses inline (#140).

The scraper split a description only at "। ੨." boundaries, so later senses
printed after a citation (`(ਸੋਹਿਲਾ) ੨. ਦੇਖੋ…`), a `#` line break, or a bare
word stayed inside one row. This module finds those printed numerals and cuts
the row there, numbering each new sense by its printed numeral.

A numeral is a sense boundary only when it continues the row's numbering
(n == current + 1), stays below the word's next existing row, and is not a
citation's number (inside parentheses), a cross-reference's sense number
(ਦੇਖੋ, ਬਾਹਰ ੩.) or a "No." reference (ਨੰ. ੧.). Numbered lists inside a sense (a shabad quoted line by
line, the four imams …) restart at ੧ and stay in the sense's text. When a
list item's number could also be the next sense, it is a sense only if:
  - the text after it opens with a head marker (ਸੰ. ਫ਼ਾ. ਸੰਗ੍ਯਾ- ਵਿ- ਦੇਖੋ …), or
  - its shape (separator, opening quote) breaks the shape every earlier item
    of the list shared;
otherwise it stays a list item and is reported. sense_overrides.json splits
or keeps specific numerals the rules get wrong (broken numerals in the
source).
"""

import json
import os
import re
import unicodedata

from parse_shorthand import LANG, POS

HERE = os.path.dirname(os.path.abspath(__file__))
OVERRIDES_PATH = os.path.join(HERE, "sense_overrides.json")

GD = "੦੧੨੩੪੫੬੭੮੯"
_GD = {c: i for i, c in enumerate(GD)}

# A printed sense numeral: 1-2 Gurmukhi digits, a period, whitespace, at the
# start of a word (after whitespace, '#', or closing punctuation).
RE_NUMERAL = re.compile(r"(?:(?<=[\s#.)।\"])|^)([੧-੯][੦-੯]?)\.\s")
# "ਨੰ. ੧." is "No. 1", a reference to another sense.
RE_NUMBER_REF = re.compile(r"ਨੰ\.\s*$")
# "ਦੇਖੋ, ਬਾਹਰ ੩." cites sense 3 of ਬਾਹਰ: a numeral right after a ਦੇਖੋ target,
# with no punctuation between (the parser's xref shape, RE_XREF).
RE_XREF_NUMBER = re.compile(r"ਦੇਖੋ[,.]?\s*[^.।,\"()#]{1,60}\s$")


def _nfd(s):
    return unicodedata.normalize("NFD", s)


def _to_int(s):
    n = 0
    for c in s:
        n = n * 10 + _GD[c]
    return n


_HEAD_MARKERS = sorted(
    [(k, ".") for k in LANG] + [(k, ".-") for k in POS] + [(_nfd("ਦੇਖੋ"), ", .")],
    key=lambda m: -len(m[0]),
)


def _opens_with_head_marker(segment):
    s = _nfd(segment)
    for marker, follow in _HEAD_MARKERS:
        if s.startswith(marker):
            rest = s[len(marker):]
            if marker[-1] in ".-," or (rest and rest[0] in follow):
                return True
    return False


def _inside_parens(text, i):
    """Local check, robust to unbalanced parens elsewhere: an unclosed '('
    before i that a ')' after i closes."""
    open_at = text.rfind("(", 0, i)
    if open_at < 0 or text.rfind(")", open_at, i) >= 0:
        return False
    close_at = text.find(")", i)
    return close_at >= 0 and text.find("(", i, close_at) < 0


class _Candidate:
    __slots__ = ("n", "num_start", "cut_start", "body_start", "sep", "quote")

    def __init__(self, text, m):
        self.n = _to_int(m.group(1))
        self.num_start = m.start(1)
        self.body_start = m.end()
        # The previous sense keeps its closing punctuation; the whitespace
        # and '#' line breaks before the numeral are dropped.
        cut = self.num_start
        while cut > 0 and (text[cut - 1].isspace() or text[cut - 1] == "#"):
            cut -= 1
        self.cut_start = cut
        before = text[cut:self.num_start]
        prev = text[cut - 1] if cut > 0 else ""
        self.sep = "#" if "#" in before else (prev if prev in '.)।"' else "word")
        self.quote = text[self.body_start:self.body_start + 1] == '"'

    def shape(self):
        return {"sep": self.sep, "quote": self.quote}


def _candidates(text):
    for m in RE_NUMERAL.finditer(text):
        before = text[:m.start(1)]
        if _inside_parens(text, m.start(1)) or RE_NUMBER_REF.search(before) or RE_XREF_NUMBER.search(before):
            continue
        yield _Candidate(text, m)


def load_overrides(path=OVERRIDES_PATH):
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        return json.load(f)["overrides"]


def _override_for(overrides, headword, sense_number, text, c):
    for o in overrides:
        if (o["headword"] == headword and o["sense_number"] == sense_number
                and text.startswith(o["at"], c.num_start)):
            return o
    return None


def _split_one(headword, s, next_existing, overrides, report):
    text = s.get("definition_text") or ""
    base = s["sense_number"]
    cur = base
    list_next = None
    list_shape = None
    cuts = []  # (candidate, sense_number)

    def note(kind, c):
        report.append({
            "kind": kind, "headword": headword, "sense_number": base,
            "numeral": c.n, "at": text[c.num_start:c.num_start + 30],
        })

    for c in _candidates(text):
        o = _override_for(overrides, headword, base, text, c)
        if o is not None:
            if o.get("keep"):
                note("override_keep", c)
                continue
            cuts.append((c, o["split_as"]))
            cur, list_next, list_shape = o["split_as"], None, None
            note("override_split", c)
            continue

        can_sense = c.n == cur + 1 and c.n < next_existing
        in_list = list_next is not None and list_next <= c.n <= list_next + 1

        if can_sense and in_list:
            shape = c.shape()
            breaks_shape = any(shape[k] != v for k, v in list_shape.items())
            if _opens_with_head_marker(text[c.body_start:]) or breaks_shape:
                is_sense = True
            else:
                is_sense = False
                note("ambiguous_list_item", c)
        elif can_sense:
            is_sense = True
        elif in_list:
            is_sense = False
        elif c.n == 1:
            list_next, list_shape = 1, c.shape()  # a list opens
            in_list, is_sense = True, False
        else:
            note("blocked_by_existing_row" if c.n == cur + 1 else "out_of_sequence", c)
            continue

        if is_sense:
            cuts.append((c, c.n))
            cur, list_next, list_shape = c.n, None, None
        elif in_list:
            shape = c.shape()
            list_shape = {k: v for k, v in list_shape.items() if shape[k] == v}
            list_next = c.n + 1

    if not cuts:
        return [s]
    pieces = []
    start, number = 0, base
    for c, n in cuts:
        pieces.append((number, text[start:c.cut_start]))
        start, number = c.body_start, n
    pieces.append((number, text[start:]))

    out = []
    for i, (n, piece) in enumerate(pieces):
        if i == 0:
            out.append(dict(s, definition_text=piece.rstrip()))
        else:
            out.append({
                "sense_number": n,
                "definition_text": piece.strip(),
                "cross_refs": None,
                "split_from": base,
            })
    return out


def split_entry_senses(headword, senses, overrides=None):
    """Split every sense of one entry. Returns (senses, report): the new
    sense list in order, and one record per numeral that was split by
    override or left inline for a reason worth reviewing."""
    if overrides is None:
        overrides = load_overrides()
    existing = sorted(s["sense_number"] for s in senses)
    report = []
    out = []
    for s in senses:
        later = [n for n in existing if n > s["sense_number"]]
        out.extend(_split_one(headword, s, later[0] if later else float("inf"), overrides, report))
    return out, report
