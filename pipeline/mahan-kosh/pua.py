#!/usr/bin/env python3
"""Maps the Mahan Kosh source font's Private Use Area glyphs to Unicode (#150).

The searchgurbani.com text carries code points U+F02B–F03F from the scraped
source's custom font. They render as boxes everywhere. pua_map.json records
what each one means, the evidence, and its rule; this module applies it:

  mark   a dot drawn under one letter but stored after the whole cluster
         (ਕ੍ਰਿਸ<F032>ਨ, ਸ੍ਰੇਸ੍ਠ<F032>, ਭਾਸਾ<F03B>); attached to the last
         target letter of the cluster just before it
  reph   superscript ਰ stored after its syllable (ਕਪੂ<F02C>ਰ); ਰ੍ moves in
         front of that cluster (ਕਰ੍ਪੂਰ)
  char   plain substitution (ੋ, laghu ।, guru ऽ)

Code points marked unresolved, and marks with no target letter in their
cluster, are left in place; find_pua() reports what remains.
"""

import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
MAP_PATH = os.path.join(HERE, "pua_map.json")

PUA_RE = re.compile("[\ue000-\uf8ff]")

NUKTA = "\u0a3c"
HALANT = "\u0a4d"
JOINERS = "\u200c\u200d"  # ZWNJ, ZWJ
# Consonants, including the precomposed nukta letters (ਖ਼ ਗ਼ ਜ਼ ੜ ਫ਼).
_CONS = "\u0a15-\u0a39\u0a59-\u0a5e"
# Dependent vowel signs, bindi, tippi, addak, yakash.
_SIGNS = "\u0a3e-\u0a4c\u0a02\u0a70\u0a71\u0a75"
# One akhar: conjunct consonants joined by halant (optionally ZWJ/ZWNJ), then any
# vowel signs, then a trailing halant and joiner if the source left one
# (ਉਸ੍, ਕ਼ਸ੍ + ZWNJ before ਦ, the mistyped ਅਸੌ੍ before ਟ).
CLUSTER = rf"(?:[{_CONS}]{NUKTA}?{HALANT}[{JOINERS}]?)*[{_CONS}]{NUKTA}?[{_SIGNS}]*{HALANT}?[{JOINERS}]?"


def _load():
    with open(MAP_PATH, encoding="utf-8") as f:
        data = json.load(f)
    by_kind = {"mark": {}, "reph": set(), "char": {}}
    for key, e in data["code_points"].items():
        ch = chr(int(key[2:], 16))
        kind = e["kind"]
        if kind == "mark":
            by_kind["mark"][ch] = e["targets"]
        elif kind == "reph":
            by_kind["reph"].add(ch)
        elif kind == "char":
            by_kind["char"][ch] = e["to"]
    return by_kind, [(o["from"], o["to"]) for o in data.get("overrides", [])]


_KINDS, OVERRIDES = _load()
MARKS = _KINDS["mark"]
REPHS = _KINDS["reph"]
CHARS = _KINDS["char"]

_MARK_RE = re.compile(f"({CLUSTER})([{''.join(MARKS)}])") if MARKS else None
_REPH_RE = re.compile(f"({CLUSTER})([{''.join(REPHS)}])") if REPHS else None


def _attach_mark(m):
    cluster, mark = m.group(1), m.group(2)
    targets = MARKS[mark]
    i = max((cluster.rfind(t) for t in targets), default=-1)
    if i < 0:
        return m.group(0)  # nothing to attach to: leave for find_pua()
    letter = cluster[i]
    rest = cluster[i + 1:]
    new = targets[letter]
    if new.endswith(NUKTA) and rest.startswith(NUKTA):
        new = new[:-1]  # already dotted
    return cluster[:i] + new + rest


def clean_pua(text: str) -> str:
    """Return `text` with every verified PUA glyph mapped to Unicode."""
    if not text or not PUA_RE.search(text):
        return text
    for src, dst in OVERRIDES:
        text = text.replace(src, dst)
    if _MARK_RE:
        text = _MARK_RE.sub(_attach_mark, text)
    if _REPH_RE:
        text = _REPH_RE.sub(lambda m: "ਰ" + HALANT + m.group(1), text)
    for src, dst in CHARS.items():
        text = text.replace(src, dst)
    return text


def find_pua(text: str) -> list:
    """PUA code points still present in `text`, in order."""
    return PUA_RE.findall(text or "")
