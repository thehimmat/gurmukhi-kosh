#!/usr/bin/env python3
"""Mahan Kosh shorthand coverage report.

Validates pipeline/mahan-kosh/abbreviations.json (the ਸੰਕੇਤ legend) against the
scraped corpus in pipeline/mahan-kosh/output/entries.jsonl and reports:

  1. sense-head classification (xref / language marker / POS marker / plain prose)
  2. per-marker counts for POS and language markers (positional matching, not
     bare substrings — short markers like ਹੀ. ਪਾ. ਸ. over-match inside words)
  3. citation coverage: how many parenthesized citations resolve to a known
     source, and the top unrecognized ones (candidates for the legend)
  4. letter-sign / structural statistics (nukta signs, footnotes, quotes)

Usage (from gurmukhi-kosh project root):
  python3 pipeline/mahan-kosh/analyze_shorthand.py            # summary to stdout
  python3 pipeline/mahan-kosh/analyze_shorthand.py --full     # + unrecognized tails
"""

import json
import os
import re
import sys
import unicodedata
from collections import Counter


def nfd(s):
    """Match in decomposed form: precomposed nukta letters (U+0A59-0A5E) are
    composition-excluded, and the corpus writes them decomposed (base + U+0A3C)."""
    return unicodedata.normalize("NFD", s)

HERE = os.path.dirname(os.path.abspath(__file__))
LEGEND_PATH = os.path.join(HERE, "abbreviations.json")
JSONL_PATH = os.path.join(HERE, "output", "entries.jsonl")

GURM = "਀-੿"
DEVA = "ऀ-ॿ"
ARAB = "؀-ۿ"

RE_PAREN = re.compile(r"\(([^()]{1,60})\)")
RE_DEVA = re.compile(rf"[{DEVA}]")
RE_ARAB_BRACKET = re.compile(rf"\[[^\]]*[{ARAB}][^\]]*\]")
RE_TOKEN = re.compile(rf"[{GURM}]+਼?\.?|-|[^\s]")
RE_GD_NUM = re.compile(r"^[੦-੯0-9]+\.?$")
ENUMERATORS = {"ੳ", "ਅ", "ੲ", "ਸ", "ਹ", "ਕ", "ਖ", "ਗ"}


def load_legend():
    with open(LEGEND_PATH, encoding="utf-8") as f:
        legend = json.load(f)

    def abbrs(entries, key="abbr"):
        out = {}
        for e in entries:
            out[nfd(e[key].rstrip("."))] = e
            for v in e.get("variants", []):
                out[nfd(v.rstrip("."))] = e
        return out

    pos = abbrs(legend["pos_markers"]["entries"])
    lang = abbrs(legend["language_markers"]["entries"])

    cs = legend["citation_sources"]
    sources = {}
    for group, key in [
        ("sggs_raags", "raag"),
        ("sggs_compositions", "work"),
        ("dasam_granth", "work"),
        ("other_works", "work"),
    ]:
        for e in cs[group]:
            # index every word of multi-word abbrs (ਗੁਵਿ ੬, ਚਰਿਤ੍ਰ [N], ਭਾਗੁ ਕ)
            head = nfd(e["abbr"].split()[0].rstrip("."))
            sources.setdefault(head, (group, e.get(key, "")))
            for v in e.get("variants", []):
                sources.setdefault(nfd(v.split()[0].rstrip(".")), (group, e.get(key, "")))
    grammar_tokens = {"ਮਃ", "ਅਃ", "ਸਃ", "ਸ", "ਵਾਰ", "ਛੰਤ", "ਸੋਲਹੇ", "ਕੇ", "ਸਵੈਯੇ", "ਬਾਰਹਮਾਹਾ", "ਥਿਤੀ", "ਪਟੀ", "ਪੈਪਾਇ"}
    bhagats = set(legend["citation_grammar"]["bhagat_authors"]) | {"ਸੱਤਾ", "ਬਲਵੰਡ"}
    return legend, pos, lang, sources, grammar_tokens, bhagats


def classify_citation(inner, sources, grammar_tokens, bhagats):
    """Return (kind, key) for one parenthesized citation body."""
    body = inner.strip().strip(".,")
    if body in ENUMERATORS:
        return "enumerator", body
    toks = [t.strip(".,") for t in body.split() if t.strip(".,")]
    if not toks:
        return "empty", ""
    if all(RE_GD_NUM.match(t) for t in toks):
        return "numeric", body
    if toks[0] == "ਲੋਕੋ":
        return "proverb", body
    if toks[0] == nfd("ਖ਼ਾ"):
        return "khalsa_argot", body
    if toks[0] == "ਦੇਖੋ":
        return "xref_paren", body
    for t in toks:
        if t in sources:
            return "source:" + sources[t][0], t
    for t in toks:
        if t in bhagats:
            return "bhagat_only", t
    if any(t in grammar_tokens for t in toks):
        return "grammar_only", body  # e.g. (ਮਃ ੫) with no raag token
    return "unrecognized", body


def head_tokens(text, n=4):
    return RE_TOKEN.findall(text[:80])[:n]


def main():
    full = "--full" in sys.argv
    if not os.path.exists(JSONL_PATH):
        sys.exit(f"corpus not found: {JSONL_PATH} — run scrape.py first")

    legend, pos_map, lang_map, sources, grammar_tokens, bhagats = load_legend()

    n_entries = n_senses = 0
    head_kind = Counter()
    pos_counts = Counter()
    lang_head = Counter()
    lang_script_adj = Counter()
    citation_kind = Counter()
    citation_unrec = Counter()
    source_hits = Counter()
    unknown_dotted = Counter()
    stats = Counter()

    known_dotted = set(lang_map) | set(pos_map) | set(sources) | grammar_tokens | {"ਦੇਖੋ", "ਸੰਬੋਧਨ", "ਲੋਕੋ"}

    with open(JSONL_PATH, encoding="utf-8") as f:
        for line in f:
            try:
                e = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not e.get("found"):
                continue
            n_entries += 1
            for s in e.get("senses") or []:
                t = nfd(s.get("definition_text") or "")
                if not t:
                    continue
                n_senses += 1

                toks = head_tokens(t)
                bare = [x.rstrip(".").rstrip(",") for x in toks]
                kind = "prose"
                if bare and bare[0] == "ਦੇਖੋ":
                    kind = "xref"
                elif bare and bare[0] in lang_map:
                    kind = "language"
                    lang_head[bare[0]] += 1
                elif bare and bare[0] in pos_map and len(toks) > 1 and (toks[1] == "-" or toks[0].endswith(".") or bare[1] in pos_map):
                    kind = "pos"
                head_kind[kind] += 1

                # POS markers anywhere (dash convention), incl. two-token ਕ੍ਰਿ. ਵਿ-
                for m in re.finditer(rf"(?:^|[^{GURM}])(ਕ੍ਰਿ)[.]?\s*(ਵਿ)-", t):
                    pos_counts["ਕ੍ਰਿ. ਵਿ"] += 1
                stripped = re.sub(rf"(?:^|[^{GURM}])ਕ੍ਰਿ[.]?\s*ਵਿ-", " ", t)
                for abbr in pos_map:
                    for _ in re.finditer(rf"(?:^|[^{GURM}])({re.escape(abbr)})-", stripped):
                        pos_counts[abbr] += 1

                # language markers immediately before a script run
                for m in re.finditer(rf"([{GURM}]+਼?)\.\s*(?:\[|[{DEVA}])", t):
                    tok = m.group(1)
                    if tok in lang_map:
                        lang_script_adj[tok] += 1

                # citations
                for m in RE_PAREN.finditer(t):
                    kind, key = classify_citation(m.group(1), sources, grammar_tokens, bhagats)
                    citation_kind[kind.split(":")[0] if kind.startswith("source") else kind] += 1
                    if kind.startswith("source"):
                        source_hits[key] += 1
                    elif kind == "unrecognized":
                        citation_unrec[key] += 1

                # unknown short dotted tokens at sense head position only
                if bare and toks[0].endswith(".") and bare[0] not in known_dotted and not RE_GD_NUM.match(bare[0]):
                    unknown_dotted[bare[0] + "."] += 1

                stats["nukta_chars"] += len(re.findall(r"਼", t))
                stats["visarga_abbr"] += len(re.findall(r"[{0}]ਃ".format(GURM), t))
                stats["footnote_refs"] += len(re.findall(r"[¹²³⁴⁵]", t))
                stats["gurbani_quotes"] += t.count('"') // 2
                stats["deva_quotes"] += t.count("''") // 2
                stats["arab_brackets"] += len(RE_ARAB_BRACKET.findall(t))
                stats["hash_breaks"] += t.count("#")

    print(f"# Mahan Kosh shorthand coverage")
    print(f"entries: {n_entries}  senses: {n_senses}\n")

    print("## Sense-head classification")
    for k, c in head_kind.most_common():
        print(f"  {k:10s} {c:6d}  ({100*c/n_senses:.1f}%)")

    print("\n## POS markers (dash convention, whole corpus)")
    for k, c in pos_counts.most_common():
        print(f"  {k:12s} {c:6d}   → {pos_map[k]['pos'] if k in pos_map else 'adverb'}")

    print("\n## Language markers")
    print("  (head = opens a sense; script = immediately precedes [Perso-Arabic] or Devanagari)")
    all_lang = Counter(lang_head) + Counter(lang_script_adj)
    for k, _ in all_lang.most_common():
        e = lang_map[k]
        print(f"  {e['abbr']:10s} head {lang_head.get(k,0):5d}  script {lang_script_adj.get(k,0):5d}   {e['english']}")

    total_cit = sum(citation_kind.values())
    rec = total_cit - citation_kind.get("unrecognized", 0)
    print(f"\n## Citations: {total_cit} parenthesized groups, {rec} recognized ({100*rec/max(total_cit,1):.1f}%)")
    for k, c in citation_kind.most_common():
        print(f"  {k:14s} {c:6d}")
    print("\n  top cited sources:")
    for k, c in source_hits.most_common(15):
        print(f"    {k:12s} {c:6d}")
    print("\n  top unrecognized citations (legend candidates):")
    for k, c in citation_unrec.most_common(30 if full else 12):
        print(f"    ({k}) × {c}")

    print("\n## Unknown sense-head dotted tokens (watchlist)")
    for k, c in unknown_dotted.most_common(30 if full else 12):
        print(f"  {k} × {c}")

    print("\n## Structural statistics")
    for k, c in stats.most_common():
        print(f"  {k:15s} {c:7d}")


if __name__ == "__main__":
    main()
