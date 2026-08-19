#!/usr/bin/env python3
"""Deterministic Mahan Kosh sense parser (issue #32).

Decomposes one Mahan Kosh sense (a `definition_text` string from
output/entries.jsonl) into structured fields, driven entirely by the cited
legend in abbreviations.json:

  language_origins  ਸੰ./ਅ਼./ਫ਼ਾ./… with the etymon when script-explicit
                    (Devanagari run, [Perso-Arabic] bracket, or Latin text);
                    a Gurmukhi-transcribed etymon (ਸੰ. ਪਾਨੀਯ.) is left in the
                    residue in v1 rather than guessed
  pos               dash-convention markers (ਸੰਗ੍ਯਾ- ਵਿ- ਕ੍ਰਿ. ਵਿ- ਧਾ- …)
  citations         parenthesized citations resolved to structured
                    {work, raag, mahala, vaar, section, bhagat}
  quotes            "…" witnesses, paired with their following citation
  xrefs             ਦੇਖੋ targets, with the optional sense number
  grammar           phrase frames (plural-of, imperative-of, vocative, …)
  residue           the prose that remains after extraction — the input to
                    the future translation phase

Matching is NFD-normalized throughout: the corpus writes nukta letters
decomposed, and U+0A59–0A5E are composition-excluded (see legend _meta).

Positional discipline: short markers are only recognized at the head chain of
a sense or immediately before a script run, never by bare substring — that is
what made the old ਉ./ਪੰ./ਦੇਸ਼. false markers possible.

Usage:
  python3 pipeline/mahan-kosh/parse_shorthand.py --run [--limit N]
      reads output/entries.jsonl, writes output/parsed.jsonl, prints stats
  python3 pipeline/mahan-kosh/test_parse_shorthand.py
      unit tests over real corpus senses
"""

import argparse
import json
import os
import re
import sys
import unicodedata
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
LEGEND_PATH = os.path.join(HERE, "abbreviations.json")

GURM = "਀-੿"
DEVA = "ऀ-ॿ"
ARAB = "؀-ۿ"

GD_DIGITS = "੦੧੨੩੪੫੬੭੮੯"
_GD = {c: str(i) for i, c in enumerate(GD_DIGITS)}

ENUM_LETTERS = {"ੳ", "ਅ", "ੲ", "ਸ", "ਹ", "ਕ", "ਖ", "ਗ", "ਘ"}


def nfd(s: str) -> str:
    return unicodedata.normalize("NFD", s)


def to_int(tok: str):
    t = "".join(_GD.get(c, c) for c in tok)
    # isascii guard: isdigit() is also true for superscripts (footnote marks
    # like ਸੂਤ੍ਰ ੨¹ in the print), which int() rejects
    return int(t) if t.isascii() and t.isdigit() else None


# --------------------------------------------------------------- legend

def _load_legend():
    with open(LEGEND_PATH, encoding="utf-8") as f:
        legend = json.load(f)

    lang = {}
    for e in legend["language_markers"]["entries"]:
        short = e["english"].split(";")[0].split(" (")[0].split(" —")[0].strip()
        rec = {"language": short, "iso639": e.get("iso639"), "marker": e["abbr"]}
        for a in [e["abbr"]] + e.get("variants", []):
            lang[nfd(a.rstrip("."))] = rec

    pos = {}
    for e in legend["pos_markers"]["entries"]:
        for a in [e["abbr"]] + e.get("variants", []):
            pos[nfd(a)] = e["pos"]

    works_single = {}
    works_multi = {}
    for group in ("sggs_compositions", "dasam_granth", "other_works"):
        for e in legend["citation_sources"][group]:
            name = e.get("work", "")
            for a in [e["abbr"]] + e.get("variants", []):
                key = nfd(a.split(" [")[0].strip().rstrip("."))
                if " " in key or key in ("ਸਵੈਯੇ ੩੩",):
                    works_multi[key] = (group, name)
                else:
                    works_single[key] = (group, name)
    # ਸਹਸ / ਸਵਾ live under citation_grammar tokens but cite compositions
    works_single[nfd("ਸਹਸ")] = ("sggs_compositions", "Sahaskriti Salok")
    works_single[nfd("ਸਵਾ")] = ("sggs_compositions", "Salok Varan te Vadhik")

    raags = {nfd(e["abbr"]): e["raag"] for e in legend["citation_sources"]["sggs_raags"]}
    bhagats = {nfd(b) for b in legend["citation_grammar"]["bhagat_authors"]}
    return legend, lang, pos, works_single, works_multi, raags, bhagats


LEGEND, LANG, POS, WORKS_1, WORKS_N, RAAGS, BHAGATS = _load_legend()

# Stamped into every parsed sense; /health flags rows whose stamp differs from
# the legend's current parse_version (issue #46). Bump it in abbreviations.json
# on any behavior change, then re-run --run + ingest.
PARSE_VERSION = str(LEGEND.get("_meta", {}).get("parse_version", "0"))

SECTION_TOKENS = {
    nfd("ਅਃ"): "ਅਸਟਪਦੀ",
    nfd("ਛੰਤ"): "ਛੰਤ",
    nfd("ਸੋਲਹੇ"): "ਸੋਲਹੇ",
    nfd("ਸ"): "ਸਲੋਕ",
    nfd("ਸਃ"): "ਸਲੋਕ",
}

# ------------------------------------------------------------ regexes

RE_QUOTE = re.compile(r'["“]([^"“”]{1,400})["”]')
RE_PAREN = re.compile(r"\(([^()]{1,70})\)")
# #75: capture stops at the first comma — a ਦੇਖੋ that runs into a comma is
# citing or narrating (ਦੇਖੋ, ਸੂਰਤ ਬਕਰ, ਆਯਤ ੭੧ …), not naming a head-word
RE_XREF = re.compile(rf"ਦੇਖੋ[,.]?\s*([^.।,\"()#]{{1,60}})[.।]?")
RE_DEVA_RUN = re.compile(rf"[{DEVA}][{DEVA}‌‍]*")
RE_BRACKET = re.compile(rf"\[\s*([^\]]{{1,60}})\s*\]")
RE_LATIN_RUN = re.compile(r"[A-Za-z][A-Za-z'’.-]*(?:\s+[A-Za-z][A-Za-z'’.-]*){0,3}")
RE_ADVERB = re.compile(rf"(?:^|(?<=[^{GURM}]))ਕ੍ਰਿ[.]?[\s-]*ਵਿ-")
RE_TOKEN_SPLIT = re.compile(r"\s+")

# language marker immediately before a script run / bracket
RE_LANG_BEFORE_SCRIPT = re.compile(rf"([{GURM}]{{1,10}})\.\s*(?=\[|[{DEVA}]|[A-Za-z])")


def _pos_marker_regexes():
    out = []
    for abbr, posv in sorted(POS.items(), key=lambda kv: -len(kv[0])):
        out.append((re.compile(rf"(?:^|(?<=[^{GURM}]))({re.escape(abbr)})-"), abbr, posv))
    return out


RE_POS_LIST = _pos_marker_regexes()

FRAME_PATTERNS = [
    (re.compile(rf"([{GURM}]+)\s+ਦਾ\s+ਬਹੁ\s?ਵਚਨ"), "number", "plural", 1),
    (re.compile(r"ਬਹੁ\s?ਵਚਨ\s+ਬੋਧਕ"), "number", "plural", None),
    (re.compile(rf"([{GURM}]+)\s+ਕ੍ਰਿਯਾ\s+ਦਾ\s+ਅਮਰ"), "mood", "imperative", 1),
    (re.compile(rf"(?:^|(?<=[^{GURM}]))ਸੰਬੋਧਨ(?=[^{GURM}]|$)"), "case", "vocative", None),
    (re.compile(r"ਭੂਤ\s?ਕਾਲ"), "tense", "past", None),
    (re.compile(r"ਵਰਤਮਾਨ\s+ਕ੍ਰਿਯਾ"), "tense", "present", None),
    (re.compile(r"ਇਸਤ੍ਰੀ\s?ਲਿੰਗ"), "gender", "feminine", None),
    (re.compile(rf"(?:^|(?<=[^{GURM}]))ਪੁਲਿੰਗ"), "gender", "masculine", None),
    (re.compile(rf"([{GURM}]+)\s+ਦਾ\s+ਸੰਖੇਪ"), "lexical", "short_form_of", 1),
]


# ------------------------------------------------------- citation parse

def parse_citation_body(body: str):
    """Return a structured citation dict, or None if the paren is not a
    citation (inline gloss, enumerator …)."""
    raw = body.strip()
    stripped = raw.strip(".,)( ")
    if not stripped:
        return None
    if stripped in ENUM_LETTERS:
        return {"kind": "enumerator"}
    if stripped.startswith("ਦੇਖੋ"):
        return {"kind": "xref"}

    toks = [t.strip(".,") for t in RE_TOKEN_SPLIT.split(stripped) if t.strip(".,")]
    if all(to_int(t) is not None for t in toks):
        return {"kind": "numeric", "numbers": [to_int(t) for t in toks]}

    cit = {
        "kind": "citation", "raw": raw, "work": None, "work_type": None,
        "raag": None, "mahala": None, "is_vaar": False, "vaar_number": None,
        "section": None, "bhagat": None, "work_number": None,
    }
    matched = False

    # multi-token works first (ਭਾਗੁ ਕ, ਗੁਵਿ ੧੦, ਚੰਡੀ ੨, ਹਜਾਰੇ ੧੦, ਮਾ ਸੰ …)
    joined = " ".join(toks)
    for key, (group, name) in WORKS_N.items():
        if key in joined:
            cit["work"], cit["work_type"], matched = name, group, True
            break

    used = set()
    mahala_digit_idx = None
    for i, t in enumerate(toks):
        if t == nfd("ਮਃ") and i + 1 < len(toks) and to_int(toks[i + 1]) is not None:
            cit["mahala"] = to_int(toks[i + 1])
            mahala_digit_idx = i + 1
            used.update((i, i + 1))
            matched = True

    savaiye = nfd("ਸਵੈਯੇ") in toks
    for i, t in enumerate(toks):
        if i in used:
            continue
        if t == nfd("ਵਾਰ"):
            cit["is_vaar"] = True
            matched = True
        elif t in RAAGS:
            if cit["raag"] is None:
                cit["raag"], matched = t, True
                if cit["work_type"] is None:
                    cit["work_type"] = "sggs_raag"
        elif t in BHAGATS:
            cit["bhagat"], matched = t, True
        elif t in SECTION_TOKENS and len(toks) > 1:
            cit["section"], matched = SECTION_TOKENS[t], True
        elif not cit["work"] and t in WORKS_1:
            group, name = WORKS_1[t]
            cit["work"], cit["work_type"], matched = name, group, True

    if savaiye and nfd("ਕੇ") in toks:
        cit["work"] = f"Bhatt Savaiye (praise of Mahala {cit['mahala']})"
        cit["work_type"] = "sggs_compositions"
        matched = True
    elif savaiye and nfd("ਮੁਖਵਾਕ") in joined:
        cit["work"] = "Savaiye Sri Mukhvak M5"
        cit["work_type"] = "sggs_compositions"
        matched = True

    # a leftover digit near ਵਾਰ/raag or a numbered work (ਚਰਿਤ੍ਰ ੧੦੮)
    for i, t in enumerate(toks):
        if i == mahala_digit_idx:
            continue
        n = to_int(t)
        if n is None:
            continue
        if cit["is_vaar"] or cit["raag"]:
            cit["vaar_number"] = cit["vaar_number"] or n
        elif cit["work"]:
            cit["work_number"] = cit["work_number"] or n

    return cit if matched else None


# ---------------------------------------------------------- sense parse

def parse_sense(text: str) -> dict:
    t = nfd(text or "")
    spans = []  # (start, end) removed from residue

    out = {
        "parser_version": PARSE_VERSION,
        "language_origins": [], "pos": [], "grammar": [],
        "citations": [], "quotes": [], "xrefs": [], "residue": "",
    }

    # 1. quotes
    quote_ends = []
    for m in RE_QUOTE.finditer(t):
        out["quotes"].append({"text": m.group(1).strip(), "citation_index": None})
        quote_ends.append(m.end())
        spans.append((m.start(), m.end()))

    # 2. parens: citations removed; glosses/enumerators stay
    for m in RE_PAREN.finditer(t):
        parsed = parse_citation_body(m.group(1))
        if not parsed:
            continue
        kind = parsed.pop("kind")
        if kind == "citation":
            idx = len(out["citations"])
            out["citations"].append(parsed)
            spans.append((m.start(), m.end()))
            for qi, qe in enumerate(quote_ends):
                if out["quotes"][qi]["citation_index"] is None and 0 <= m.start() - qe <= 3:
                    out["quotes"][qi]["citation_index"] = idx
                    break
        elif kind == "xref":
            inner = re.sub(r"^ਦੇਖੋ[,.]?\s*", "", m.group(1).strip())
            if _append_xrefs(out, inner):
                spans.append((m.start(), m.end()))
        # enumerator / numeric parens stay in the residue

    # 3. ਦੇਖੋ clauses outside parens
    for m in RE_XREF.finditer(t):
        if any(s <= m.start() < e for s, e in spans):
            continue
        if _append_xrefs(out, m.group(1)):
            spans.append((m.start(), m.end()))

    # 4. language markers immediately before script runs (anywhere)
    seen_lang_at = set()
    for m in RE_LANG_BEFORE_SCRIPT.finditer(t):
        tok = m.group(1)
        if tok not in LANG:
            continue
        if any(s <= m.start() < e for s, e in spans):
            continue
        etymon, ety_span = _read_etymon(t, m.end())
        rec = dict(LANG[tok])
        rec.update({"etymon": etymon, "position": m.start()})
        out["language_origins"].append(rec)
        seen_lang_at.add(m.start())
        spans.append((m.start(), m.end()))
        if ety_span:
            spans.append(ety_span)

    # 5. head chain: markers at the very start (after any leading xref)
    chain = _skip_leading(t, spans)
    while chain < len(t):
        m = re.match(rf"\s*([{GURM}]{{1,10}})\.", t[chain:])
        if not m:
            break
        tok = m.group(1)
        if tok not in LANG:
            break
        start = chain + m.start(1)
        if start not in seen_lang_at:
            rec = dict(LANG[tok])
            rec.update({"etymon": None, "position": start})
            out["language_origins"].append(rec)
            seen_lang_at.add(start)
            spans.append((start, chain + m.end()))
            chain += m.end()
            ety, ety_span = _gurmukhi_etymon(t, chain)
            if ety:
                rec["etymon"] = ety
                spans.append(ety_span)
                chain = ety_span[1]
        else:
            # already recorded via script-adjacency; skip past marker + etymon
            chain += m.end()
            _, ety_span = _read_etymon(t, chain)
            if ety_span:
                chain = ety_span[1]

    out["language_origins"].sort(key=lambda o: o["position"])

    # 6. POS markers (dash convention); two-token adverb first
    pos_spans = []
    for m in RE_ADVERB.finditer(t):
        pos_spans.append((m.start(), m.end()))
        out["pos"].append({"marker": "ਕ੍ਰਿ. ਵਿ", "pos": "adverb", "position": m.start()})
    for rex, abbr, posv in RE_POS_LIST:
        for m in rex.finditer(t):
            if any(s <= m.start(1) < e for s, e in pos_spans):
                continue
            pos_spans.append((m.start(1), m.end()))
            out["pos"].append({"marker": abbr, "pos": posv, "position": m.start(1)})
    out["pos"].sort(key=lambda p: p["position"])
    spans.extend(pos_spans)

    # 7. grammar frames (left in the residue)
    for rex, attr, value, refgroup in FRAME_PATTERNS:
        for m in rex.finditer(t):
            referent = m.group(refgroup) if refgroup else None
            out["grammar"].append({"attribute": attr, "value": value, "referent": referent})

    out["residue"] = _residue(t, spans)
    for k in ("language_origins", "pos"):
        for item in out[k]:
            item.pop("position", None)
    return out


# a target is one Gurmukhi-script token with no digits and no abbreviation
# sign ਃ (which marks citations: ਮਃ, ਅਃ, ਨੰਃ)
RE_XREF_TARGET = re.compile(rf"[{GURM}]+")
RE_XREF_NONWORD = re.compile(rf"[{GD_DIGITS}0-9ਃ]")
# 'ਦੇਖੋ, X ਸ਼ਬਦ' and 'ਦੇਖੋ, X ਧਾ' both point at the entry for X
XREF_QUALIFIERS = tuple(nfd(q) for q in ("ਸ਼ਬਦ", "ਧਾ"))
ZWJ_CHARS = "‌‍ "


def _append_xrefs(out, inner):
    """Extract head-word-shaped targets from a ਦੇਖੋ clause. Returns True when
    at least one target is accepted. On False the caller leaves the clause in
    the residue: prose after ਦੇਖੋ is a sentence, not a pointer, and a clause
    with any prose-shaped part asserts nothing — an xref missed here is
    recoverable, a wrong one is asserted provenance (#75)."""
    inner = inner.split(",")[0]
    inner = inner.strip().rstrip(".।").strip()
    sense_number = None
    m = re.search(rf"\s+([{GD_DIGITS}0-9]+)$", inner)
    if m:
        sense_number = to_int(m.group(1))
        inner = inner[: m.start()].strip()
    targets = []
    for part in re.split(r"\s+ਅਤੇ\s+|\s+ਜਾਂ\s+", inner):
        part = part.strip(ZWJ_CHARS)
        for q in XREF_QUALIFIERS:
            part = re.sub(rf"\s+{q}$", "", part).strip(ZWJ_CHARS)
        if not part:
            continue
        if not RE_XREF_TARGET.fullmatch(part) or RE_XREF_NONWORD.search(part):
            return False
        targets.append(part)
    for tgt in targets:
        out["xrefs"].append({"target": tgt, "sense_number": sense_number})
    return bool(targets)


def _read_etymon(t, pos):
    """Script-explicit etymon at position `pos`: [Perso-Arabic], a Devanagari
    run, or Latin text. Returns (etymon|None, span|None)."""
    m = re.match(r"\s*", t[pos:])
    p = pos + m.end()
    b = RE_BRACKET.match(t, p)
    if b:
        return {"script": "perso_arabic", "text": b.group(1).strip()}, (p, b.end())
    d = RE_DEVA_RUN.match(t, p)
    if d:
        return {"script": "devanagari", "text": d.group(0).strip("‌‍")}, (p, d.end())
    l = RE_LATIN_RUN.match(t, p)
    if l:
        return {"script": "latin", "text": l.group(0).rstrip(".")}, (p, l.end())
    return None, None


def _gurmukhi_etymon(t, pos):
    """Gurmukhi-transcribed etymon after a head-chain language marker
    (ਸੰ. ਪਾਨੀਯ. ਸੰਗ੍ਯਾ- …). Deterministic guard: the candidate token must not
    itself be a marker, and the token right after it must be a POS marker
    (with dash) or another language marker (with dot) — otherwise it is an
    ordinary first gloss and nothing is claimed. Flagged inferred: this is
    our reading, not script-explicit like Devanagari or [Perso-Arabic]."""
    m = re.match(rf"\s*([{GURM}]{{2,15}})\.", t[pos:])
    if not m:
        return None, None
    tok = m.group(1)
    if tok in LANG or tok in POS or tok == "ਦੇਖੋ":
        return None, None
    after = pos + m.end()
    nm = re.match(rf"\s*([{GURM}]{{1,12}})(-|\.)", t[after:])
    if not nm:
        return None, None
    ntok, sep = nm.group(1), nm.group(2)
    if (sep == "-" and ntok in POS) or (sep == "." and ntok in LANG):
        return {"script": "gurmukhi", "text": tok, "inferred": True}, (pos + m.start(1), after)
    return None, None


def _skip_leading(t, spans):
    """Start of the head chain: past leading whitespace and any leading
    already-extracted span (e.g. a sense-initial ਦੇਖੋ clause)."""
    p = len(t) - len(t.lstrip())
    moved = True
    while moved:
        moved = False
        for s, e in spans:
            if s <= p < e:
                p = e
                moved = True
        while p < len(t) and t[p] in " .,।":
            p += 1
            moved = True
    return p


def _residue(t, spans):
    keep = []
    last = 0
    for s, e in sorted(set(spans)):
        if s > last:
            keep.append(t[last:s])
        last = max(last, e)
    keep.append(t[last:])
    r = "".join(keep).replace("#", " ")
    r = re.sub(r"\s+([.।,])", r"\1", r)
    r = re.sub(r"([.।])[.।\s]*(?=[.।])", r"\1", r)
    r = re.sub(r"\s{2,}", " ", r)
    return r.strip(" .,।-").strip() and (re.sub(r"\s{2,}", " ", r).strip(" ,-").strip()) or ""


# ----------------------------------------------------------------- run

def run_corpus(limit=0):
    src = os.path.join(HERE, "output", "entries.jsonl")
    dst = os.path.join(HERE, "output", "parsed.jsonl")
    if not os.path.exists(src):
        sys.exit(f"corpus not found: {src}")

    stats = Counter()
    langs = Counter()
    poses = Counter()
    n = 0
    with open(src, encoding="utf-8") as f, open(dst, "w", encoding="utf-8") as out:
        for line in f:
            try:
                e = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not e.get("found"):
                continue
            n += 1
            if limit and n > limit:
                break
            parsed_entry = {
                "gurmukhi": e["gurmukhi"],
                "entry_gurmukhi": e.get("entry_gurmukhi"),
                "mk_id": e.get("mk_id"),
                "senses": [],
            }
            for s in e.get("senses") or []:
                p = parse_sense(s.get("definition_text") or "")
                p["sense_number"] = s.get("sense_number")
                parsed_entry["senses"].append(p)
                stats["senses"] += 1
                stats["with_language"] += bool(p["language_origins"])
                stats["with_etymon"] += any(o["etymon"] for o in p["language_origins"])
                stats["with_pos"] += bool(p["pos"])
                stats["with_citation"] += bool(p["citations"])
                stats["with_xref"] += bool(p["xrefs"])
                stats["quotes"] += len(p["quotes"])
                stats["quotes_paired"] += sum(
                    1 for q in p["quotes"] if q["citation_index"] is not None
                )
                for o in p["language_origins"]:
                    langs[o["language"]] += 1
                for pp in p["pos"]:
                    poses[pp["pos"]] += 1
            out.write(json.dumps(parsed_entry, ensure_ascii=False) + "\n")

    print(f"entries: {n}  senses: {stats['senses']}")
    for k in ("with_language", "with_etymon", "with_pos", "with_citation", "with_xref"):
        print(f"  {k:16s} {stats[k]:6d}  ({100*stats[k]/max(stats['senses'],1):.1f}%)")
    print(f"  quotes paired    {stats['quotes_paired']}/{stats['quotes']}")
    print("\nlanguages:", dict(langs.most_common()))
    print("\npos:", dict(poses.most_common()))
    print(f"\nwrote {dst}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", action="store_true", help="parse the whole corpus")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()
    if args.run:
        run_corpus(args.limit)
    else:
        ap.print_help()
