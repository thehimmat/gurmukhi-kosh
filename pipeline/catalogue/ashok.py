#!/usr/bin/env python3
"""Read entries out of the OCR text of Shamsher Singh Ashok's manuscript catalogues.

  python3 pipeline/catalogue/ashok.py parse OCR_DIR KEY [sgpc|bv2] > data/ashok/KEY.jsonl
  python3 pipeline/catalogue/ashok.py import data/ashok/KEY.jsonl [...] --date YYYY-MM-DD

OCR_DIR holds one NNNN.txt per page (tesseract, Panjabi). Each entry in the catalogues is
a numbered header with the library's MS number (ਨੰ:), then labelled fields: ਲੇਖਕ (author),
ਵੇਰਵਾ (description, with ਪਤ੍ਰ = folios), ਸਮਾਂ (date: ਰਚਨਾ ਕਾਲ composed / ਨਕਲ copied; a
lone date is the copy date), ਸਥਾਨ (place), ਲਿਖਾਰੀ (scribe). A MS holding several texts
lists them as (ੳ)/(ਅ)… lines with their authors.

Only bibliographic facts are kept; the catalogue's prose and the incipit/explicit
quotations are not.
"""

import json
import os
import re
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from seed import norm_title  # noqa: E402

DIGITS = str.maketrans("੦੧੨੩੪੫੬੭੮੯", "0123456789")
DIGIT = r"[੦-੯0-9Oo]"  # O/o: OCR for zero
NUM = DIGIT + "+"
HEADER = re.compile(rf"^\s*({NUM})\s*[.,]\s+(?:\(\s*[ੳਉਓ]\s*\)\s*)?(.+?)\s*$")
# Vol. 2 headers end with "(ਨੰ. <MS no>, <holder abbreviation>)".
HEADER2 = re.compile(rf"^\s*({NUM})\s*[.,]\s+(?:\(\s*[ੳਉਓ]\s*\)\s*)?(.+?)\s*\(\s*ਨੰ\s*[.:;,]?\s*([^,)]*?)\s*,\s*([^)]+?)\s*\)\s*$")
# Vol. 2 contents: "(ਘ) <title> ,, 189--202," or "(੧੫) <title> (, ,) 429--32,"
SUBITEM2 = re.compile(r"^\s*\(\s*[\u0A05-\u0A39\u0A72\u0A73੦-੯]{1,3}\s*\)\s*(.+?)\s*(?:,,|\(\s*,|\s[੦-੯0-9]+\s*-{1,3})")
# ਨੰ: and its OCR slips; the colon is sometimes lost ("ਨੰ ੧੮੧੦"), then two digits are required.
MS_NO = re.compile(rf"(?:ਨੰ|ਨੌ|ਨੇ|ਨੈ|ਠੰ|ਨ)\s*(?:[:;.]\s*({NUM})|\s({DIGIT}{{2,}}))")
FIELDS = r"(ਅਨੁਵਾਦਕ|ਲੇਖਕ|ਲੋਖਕ|ਸਮਾਂ|ਸਮਾ|ਲਿਖਾਰੀ|ਲਿਖਾਗੀ|ਲਿਖਾਗੇ|ਸਥਾਨ|ਵੇਰਵਾ|ਆਕਾਰ|ਆਰੰਭ|ਆਰੇਭ|ਆਰੈਭ|ਆਰੌਭ|ਅੰਤ|ਅਤ)\s*[-–—]+"
FIELD_RE = re.compile(FIELDS)
CANON = {"ਲਿਖਾਗੀ": "ਲਿਖਾਰੀ", "ਲਿਖਾਗੇ": "ਲਿਖਾਰੀ", "ਲੋਖਕ": "ਲੇਖਕ", "ਸਮਾ": "ਸਮਾਂ", "ਆਰੇਭ": "ਆਰੰਭ", "ਆਰੈਭ": "ਆਰੰਭ", "ਆਰੌਭ": "ਆਰੰਭ", "ਅਤ": "ਅੰਤ"}
SUBITEM = re.compile(r"^\s*\(\s*[ੳਉਅੲਸਹਕਖਗ]\s*\)\s*(.+?)\s*\(\s*(?:ਲੇਖਕ|ਲੋਖਕ)\s*[-–—]+\s*(.+?)\s*\)\s*$")
UNKNOWN = re.compile(r"^ਨਾਂ?\s*ਮਾਲ੍?ੂ?ਹ?ਮ")  # ਨਾ ਮਾਲੂਮ, ਨਾ ਮਾਲਮ, ਨਾਂ ਮਾਲ੍ਹਮ: not known
TRIM = " \t।|!.,;:-'\"`_"


def _num(s: str) -> str:
    return re.sub(r"\D", "", s.translate(DIGITS).replace("O", "0").replace("o", "0"))


def _clean(s):
    s = (s or "").strip(TRIM)
    return None if not s or UNKNOWN.match(s) else s


def _norm_date(s):
    s = re.sub(r"(?:ਸ਼|ਸ਼|ਸ)[ੰੌੇਂੋੈ]*ਮਤ", "ਸੰਮਤ", s)  # ਸ਼ੰੌਮਤ, ਸੇਮਤ, ਸੋਮਤ, ਸੈਮਤ → ਸੰਮਤ
    s = re.sub(r"([੦-੯0-9]{4})\s*(?:ਕਿ|੪)\s*(?=[:.।\s]|$)", r"\1 ਬਿ", s)  # ਬਿ read as ਕਿ or ੪
    s = re.sub(r"ਬਿ(?!ਕ)\s*[:.]?", "ਬਿ.", s)  # ਬਿ: → ਬਿ., leaving ਬਿਕ੍ਰਮੀ whole
    s = re.sub(r"([੦-੯]{2})\s*ਵ[^\s]*\s*(?:ਸਦੀ|ਕਦੀ)", r"\1ਵੀਂ ਸਦੀ", s)  # ੧੯ ਵੀ. ਸਦੀ → ੧੯ਵੀਂ ਸਦੀ
    s = re.sub(r"ਸਦੀ\s+ਬਿ\.", "ਸਦੀ ਬਿ.", s)
    s = s.strip(" \t।|!,;:-")
    return None if not s or UNKNOWN.match(s) else s


def split_dates(text: str):
    """ਸਮਾਂ field → (composed, copied); a lone date is the copy date."""
    composed = re.search(r"ਰਚਨਾ\s*ਕਾਲ\s*[:;]?\s*(.+?)(?=,|;|ਨਕਲ|$)", text)
    copied = re.search(r"ਨਕਲ\s*[:;]?\s*(.+?)(?=,|;|$)", text)
    if composed or copied:
        return (_norm_date(composed.group(1)) if composed else None,
                _norm_date(copied.group(1)) if copied else None)
    d = _norm_date(text)
    return (None, d if d and re.search(r"[੦-੯0-9]|ਸਦੀ", d) else None)


def _fields(body: str) -> dict:
    out = {}
    marks = list(FIELD_RE.finditer(body))
    for i, m in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(body)
        name = CANON.get(m.group(1), m.group(1))
        val = body[m.end():end]
        if name in ("ਲੇਖਕ", "ਅਨੁਵਾਦਕ", "ਸਥਾਨ", "ਲਿਖਾਰੀ", "ਸਮਾਂ"):
            val = re.split(r"[\n।!|]", val.strip(), maxsplit=1)[0] if name != "ਸਮਾਂ" else val.split("\n")[0]
        out.setdefault(name, val.strip())
    return out


# The holders in vol. 2's key (ਸੰਕੇਤ ਤੇ ਪਤੇ), transcribed; matched by consonants, which
# survive OCR better than vowel signs and dots. (abbreviation, name, private collection?)
HOLDERS = [
    ("ਮ. ਕਾ. ਪ.", "Mahendra College Library, Patiala", False),
    ("ਖ਼ਾ. ਕਾ. ਪ.", "Khalsa College Library, Patiala", False),
    ("ਡਾ. ਗੰ. ਸਿੰ.", "Dr Ganda Singh, Lower Mall, Patiala", True),
    ("ਪ੍ਰੋ. ਪ੍ਰੀ. ਸਿੰ.", "Prof. Pritam Singh, Mahendra College, Patiala", True),
    ("ਖ਼ਾ. ਕਾ. ਅ.", "Khalsa College Library, Amritsar", False),
    ("ਸਿ. ਰੈ. ਲਾ.", "Sikh Reference Library, Amritsar", False),
    ("ਸ਼੍ਰੀ ਗੁ. ਰਾ. ਦਾ. ਲਾ. ਅ.", "Sri Guru Ram Das Library, Amritsar", False),
    ("ਸੈਂ. ਸਿ. ਮ. ਅ.", "Central Sikh Museum, Amritsar", False),
    ("ਮੋ. ਲਾ. ਨ. ਮ. ਲਾ. ਅ.", "Moti Lal Nehru Municipal Library, Amritsar", False),
    ("ਬਾ. ਹ. ਸਿੰ. ਵ.", "Bawa Hari Singh, Vakil, Jallianwala Bagh, Amritsar", True),
    ("ਭਾ. ਮ. ਸਿੰ. ਐ. ਖ਼ਾ. ਸ.", "Bhai Maha Singh, editor of Khalsa Samachar, Amritsar", True),
    ("ਡੇ. ਸੰ. ਅ.", "Dera Sanglan Wala, Bazar Mai Sevan, Amritsar", False),
    ("ਡੇ. ਬਾ. ਸ਼ਾ. ਸਿੰ. ਅ.", "Dera Baba Sham Singh, Amritsar", False),
    ("ਗਿ. ਕ. ਸਿੰ. ਗ੍ਰੰ.", "Giani Karam Singh Granthi, Bazar Mai Sevan, Amritsar", True),
    ("ਸੇ. ਸਿੰ. ਗਿ. ਤ.", "Sewa Singh Giani, Tarn Taran", True),
    ("ਪੰ. ਯੂ. ਚੰ.", "Panjab University Library, Chandigarh", False),
    ("ਡਾ. ਸੁ. ਸਿੰ. ਕੋ.", "Dr Surinder Singh Kohli, Panjab University, Chandigarh", True),
    ("ਪ੍ਰੋ. ਕ. ਸਿੰ. ਸੂ.", "Prof. Kartar Singh Suri, Panjab University, Chandigarh", True),
    ("ਸਿ. ਕੰ. ਮ. ਵਿ. ਫ਼ੀ.", "Sikh Kanya Maha Vidyalaya, Firozpur", False),
    ("ਡਾ. ਸ਼. ਸਿੰ.", "Dr Sher Singh, Model Town, Ludhiana", True),
    ("ਅ. ਸਿੰ. ਆ.", "Avtar Singh Azad, Jalandhar", True),
    ("ਵਿ. ਵੈ. ਰੀ. ਇ. ਹੁ.", "Vishveshvaranand Vedic Research Institute, Hoshiarpur", False),
    ("ਨਾ. ਪ੍ਰ. ਸ. ਬ.", "Nagari Pracharini Sabha, Banaras", False),
    ("ਸ਼੍ਰੀ ਹ. ਮੰ. ਪ.", "Takht Sri Harimandir Sahib, Patna", False),
    ("ਖ਼ੁ. ਬ. ਲਾ. ਬਾਂ. ਪ.", "Khuda Bakhsh Library, Bankipur, Patna", False),
]


# Abbreviations from vol. 1's key, which isn't in Drive: expansions inferred from vol. 2's
# usage and the period's collections. Flagged so the PR and the notes say so.
HOLDERS_INFERRED = [
    ("ਭਾ. ਵਿ.", "Bhasha Vibhag (Languages Department), Patiala", False),
    ("ਮੋ. ਬਾ.", "Moti Bagh Palace Library, Patiala", False),
    ("ਸ਼. ਸਿੰ. ਅ.", "Shamsher Singh Ashok (the compiler's own collection)", True),
    ("ਪੰ. ਆ.", "Punjab State Archives, Patiala", False),
    ("ਸੈਂ. ਪ. ਲਾ.", "Central Public Library, Patiala", False),
    ("ਪੰ. ਸਾ. ਅ.", "Panjabi Sahit Akademi, Ludhiana", False),
]
# OCR spellings seen in the headers, as aliases of a key abbreviation.
HOLDER_ALIASES = {"ਪੋ. ਪ੍ਰੀ. ਸਿੰ.": "ਪ੍ਰੋ. ਪ੍ਰੀ. ਸਿੰ.", "ਡਾ. ਹੈ. ਸਿੰ.": "ਡਾ. ਗੰ. ਸਿੰ.",
                  "ਸ਼੍ਰੀ ਗੁ. ਰਾ. ਦਾ. ਲਾ.": "ਸ਼੍ਰੀ ਗੁ. ਰਾ. ਦਾ. ਲਾ. ਅ."}


def _consonants(s: str) -> str:
    s = unicodedata.normalize("NFD", s.replace("੫", "ਪ")).replace("\u0A3C", "")  # ੫ is OCR for ਪ
    return "".join(ch for ch in s if "\u0A05" <= ch <= "\u0A39" or "\u0A59" <= ch <= "\u0A5E" or ch in "ੲੳ")


_HOLDER_KEYS = {_consonants(a): {"abbr": a, "name": n, "private": p, "inferred": False} for a, n, p in HOLDERS}
for _a, _n, _p in HOLDERS_INFERRED:
    _HOLDER_KEYS.setdefault(_consonants(_a), {"abbr": _a, "name": _n, "private": _p, "inferred": True})
for _alias, _a in HOLDER_ALIASES.items():
    _HOLDER_KEYS.setdefault(_consonants(_alias), _HOLDER_KEYS[_consonants(_a)])


def holder(abbr: str):
    """A vol. 2 holder abbreviation as OCR'd → {abbr, name, private}, or None."""
    return _HOLDER_KEYS.get(_consonants(abbr))


def parse_entries(pages: dict, style: str = "sgpc") -> list[dict]:
    """pages: {page number: OCR text} → entries in catalogue order. style: "sgpc" (SGPC 1968)
    or "bv2" (Bhasha Vibhag 1963, vol. 2, whose headers name the holder)."""
    if style == "bv2":
        return _parse_bv2(pages)
    lines = []
    for p in sorted(pages):
        lines += [(p, ln) for ln in pages[p].splitlines()]
    starts = []
    for i, (p, ln) in enumerate(lines):
        m = HEADER.match(ln)
        if not m:
            continue
        ms = MS_NO.search(m.group(2))
        ahead = []
        for _, l2 in lines[i + 1:i + 6]:  # up to the next header
            if HEADER.match(l2):
                break
            if l2.strip():
                ahead.append(l2)
        if not ms and ahead:  # the MS number may sit on the next non-blank line
            ms = MS_NO.match(ahead[0].strip())
        has_fields = any(re.match(r"\s*(?:ਲੇਖਕ|ਲੋਖਕ|ਆਕਾਰ|ਵੇਰਵਾ|ਸਮਾਂ)\s*[-–—]", l2) for l2 in ahead[:3])
        if not ms and not has_fields:
            continue  # a footnote or list item, not an entry
        title = m.group(2)[:ms.start()] if ms and MS_NO.search(m.group(2)) else m.group(2)
        ms_no = _num(ms.group(1) or ms.group(2)) if ms else None
        starts.append((i, p, int(_num(m.group(1)) or 0), title.strip(TRIM + " ,"), ms_no))
    entries = []
    for k, (i, p, no, title, ms_no) in enumerate(starts):
        end = starts[k + 1][0] if k + 1 < len(starts) else len(lines)
        body_lines = [ln for _, ln in lines[i + 1:end]]
        contents = []
        for ln in body_lines:
            s = SUBITEM.match(ln)
            if s:
                contents.append({"title": s.group(1).strip(TRIM), "author": _clean(s.group(2))})
        body = "\n".join(ln for ln in body_lines if not SUBITEM.match(ln))
        f = _fields(body)
        composed, copied = split_dates(f.get("ਸਮਾਂ", ""))
        author = f.get("ਲੇਖਕ") or ""
        in_author = re.search(r"\(\s*((?:ਸ਼|ਸ਼|ਸ)[ੰੌੇਂੋੈ]*ਮਤ[^)]*)\)", author)  # "ਕਵਿ X (ਸੰਮਤ ੧੬੯੨ ਬਿ:)"
        if in_author:
            composed = composed or _norm_date(in_author.group(1))
            author = author[:in_author.start()] + author[in_author.end():]
        folios = re.search(r"ਪੱ?ਤ੍?ਰ?[ੇਾ]?[^\d੦-੯;]{0,4}([੦-੯0-9]+)", f.get("ਵੇਰਵਾ", ""))
        entries.append({
            "no": no, "ms_no": ms_no, "title": title, "page": p,
            "author": _clean(author), "translator": _clean(f.get("ਅਨੁਵਾਦਕ")), "folios": int(_num(folios.group(1))) if folios else None,
            "composed": composed, "copied": copied,
            "place": _clean(f.get("ਸਥਾਨ")), "scribe": _clean(f.get("ਲਿਖਾਰੀ")),
            "contents": contents,
            "ocr_doubt": bool(re.search(r"[੦-੯0-9]{5,}", f"{composed or ''} {copied or ''}")),
        })
    return entries


def _parse_bv2(pages: dict) -> list[dict]:
    lines = []
    for p in sorted(pages):
        lines += [(p, ln) for ln in pages[p].splitlines()]
    starts = [(i, p, HEADER2.match(ln)) for i, (p, ln) in enumerate(lines) if HEADER2.match(ln)]
    entries = []
    for k, (i, p, m) in enumerate(starts):
        end = starts[k + 1][0] if k + 1 < len(starts) else len(lines)
        body_lines = [ln for _, ln in lines[i + 1:end]]
        contents = [{"title": s.group(1).strip(TRIM), "author": None}
                    for s in map(SUBITEM2.match, body_lines) if s]
        body = "\n".join(ln for ln in body_lines if not SUBITEM2.match(ln))
        f = _fields(body)
        composed, copied = split_dates(f.get("ਸਮਾਂ", ""))
        folios = re.search(r"ਪੱ?ਤ੍?ਰ?[ੇਾ]?[^\d੦-੯;]{0,4}([੦-੯0-9]+)", f.get("ਵੇਰਵਾ", ""))
        ms_no = _num(m.group(3)) or None
        entries.append({
            "no": int(_num(m.group(1)) or 0), "ms_no": ms_no, "holder": m.group(4).strip(),
            "title": m.group(2).strip(TRIM + " ,"), "page": p,
            "author": _clean(f.get("ਲੇਖਕ")), "translator": _clean(f.get("ਅਨੁਵਾਦਕ")),
            "folios": int(_num(folios.group(1))) if folios else None,
            "composed": composed, "copied": copied,
            "place": _clean(f.get("ਸਥਾਨ")), "scribe": _clean(f.get("ਲਿਖਾਰੀ")),
            "contents": contents,
            "ocr_doubt": bool(re.search(r"[੦-੯0-9]{5,}", f"{composed or ''} {copied or ''}")),
        })
    return entries


# ---------------------------------------------------------------- romanization

_ASCII = str.maketrans({"ā": "a", "ī": "i", "ū": "u", "ṅ": "n", "ñ": "n", "ṇ": "n", "ṃ": "n", "ṭ": "t",
                        "ḍ": "d", "ṛ": "r", "ḥ": "h", "ē": "e", "ō": "o", "ṁ": "n"})
_CONS = re.compile(r"[ਕ-ਹਖ਼-ਫ਼]")
_MATRA = re.compile(r"[ਾ-ੌ]")


def _with_schwa_deletion(word: str) -> str:
    """Add a halant (੍) where Panjabi drops the inherent vowel: after a word-final bare
    consonant, and after a bare consonant that follows a vowel and precedes a consonant
    carrying a vowel sign (ਗੋਸ਼ਟਿ → ਗੋਸ਼੍ਟਿ)."""
    # Units: a consonant with its nukta (ਸ + ਼ = ਸ਼) counts as one letter.
    units = re.findall(r"[\u0A15-\u0A39\u0A59-\u0A5E]\u0A3C?|.", word, flags=re.S)
    out = []
    for i, u in enumerate(units):
        out.append(u)
        if not _CONS.match(u[0]):
            continue
        nxt = units[i + 1] if i + 1 < len(units) else ""
        if nxt and (_MATRA.match(nxt) or nxt in ("\u0A4D", "\u0A70", "\u0A71")):
            continue  # has a vowel sign, halant or addak/tippi follows
        rest = units[i + 1:]
        if not any(_CONS.match(c[0]) for c in rest):
            out.append("\u0A4D")  # word-final bare consonant
            continue
        j = next(k for k, c in enumerate(rest) if _CONS.match(c[0]))
        after = rest[j + 1] if j + 1 < len(rest) else ""
        prev = units[i - 1] if i > 0 else ""
        if prev and (_MATRA.match(prev) or prev in "ਅਆਇਈਉਊਏਐਓਔ\u0A70\u0A02") and after and _MATRA.match(after):
            out.append("\u0A4D")
    return "".join(out)


def roman(gurmukhi: str) -> str:
    """Plain-ASCII title case: 'ਮੋਖ ਪੰਥ ਪ੍ਰਕਾਸ਼' → 'Mokh Panth Prakash'."""
    from gurmukhi_transliterate import GurmukhiRomanizer
    r = GurmukhiRomanizer("shackle")
    parts = re.split(r"([\s\-–—(),:]+)", gurmukhi)
    out = []
    for p in parts:
        if not p or re.fullmatch(r"[\s\-–—(),:]+", p):
            out.append(p)
            continue
        s = r.romanize(_with_schwa_deletion(p))
        s = unicodedata.normalize("NFC", s).replace("ś", "sh").replace("ṣ", "sh").translate(_ASCII)
        s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
        s = re.sub(r"([bcdgjkpt])h\1h", r"\1\1h", s)  # addak before an aspirate: dhdh → ddh
        out.append(s[:1].upper() + s[1:])
    return "".join(out).strip()


def match_key(title: str) -> str:
    """A consonant skeleton for matching titles across romanizations
    ('Adhyatma Ramayan' ~ 'Adhiatam Ramain')."""
    k = re.sub(r"[aeiouyhw]", "", norm_title(title))
    return re.sub(r"(.)\1+", r"\1", k)


# ---------------------------------------------------------------- catalogue finds

CATALOGUES = {
    "sgpc-1968": {"short": "Ashok 1968", "repository": "Sikh Reference Library, Amritsar",
                  "work_id": "w-sikh-reference-library-ms-catalogue",
                  "cite": "Ashok, Sikh Reference Library manuscript catalogue (SGPC 1968)"},
    "bhasha-vibhag-1963-v2": {"short": "Ashok 1963 vol. 2", "repository": None,
                              "work_id": "w-panjabi-hath-likhtan-di-suchi",
                              "cite": "Ashok, Panjabi Hath Likhtan di Suchi vol. 2 (Bhasha Vibhag 1963)"},
}
# Parentheticals that describe this copy, not the work: (ਅਧੂਰਾ) incomplete, (… ਸਮੇਤ) with …, (… ਤਕ) up to …
QUALIFIER = re.compile(r"\s*\([^)]*(?:ਅਧੂਰ|ਸਮ[ੇੋੌ]+ਤ|ਤਕ|ਭਾਗ)[^)]*\)")
MIN_KEY = 5  # shorter skeletons match too much


_LEX = None


def _lexicon():
    global _LEX
    if _LEX is None:
        from gurmukhi_transliterate.lexicon import load_lexicon
        _LEX = load_lexicon()
    return _LEX


def fix_title(title: str) -> str:
    """Undo this font's common OCR slips in a title, conservatively: a tippi (ੰ) read as
    ੇ, ੈ or ੍ is restored only where the corrected word is in the Gurbani lexicon and the
    OCR'd one is not; a leading ਸੀ becomes ਸ੍ਰੀ; stray marks at the ends are trimmed."""
    lex = _lexicon()
    t = unicodedata.normalize("NFC", title)
    t = re.sub(r"[\s\u0A4D\u200c\u200d“”\"'`.,;:!|_\-–—]+$", "", t).strip()
    t = re.sub(r"\s+", " ", t)
    t = re.sub(r"^ਸੀ ", "ਸ੍ਰੀ ", t)

    def fix_word(m):
        w = m.group(0)
        if lex.get(w) or len(w) < 2:
            return w
        cands = [w[:i] + "ੰ" + w[i + 1:] for i, ch in enumerate(w) if ch in "ੇੈ\u0A4D"]
        cands = [c for c in cands if lex.get(unicodedata.normalize("NFC", c))]
        return max(cands, key=lambda c: lex.get(c, 0)) if cands else w

    return re.sub(r"[\u0A00-\u0A7F]+", fix_word, t)


def _work_title(title: str) -> str:
    return QUALIFIER.sub("", fix_title(title)).strip(TRIM + " ,")


def to_finds(entries: list[dict], cat: dict) -> dict:
    """Entries → a candidates.py finds payload: one catalogue-record version per entry,
    containing known works by id and unknown ones by title (spelling variants grouped)."""
    known = {}
    for w in cat["works"]:
        if w["status"] == "rejected":
            continue
        titles = [w["title"]["roman"], *w["title"].get("variants", [])]
        if w["title"].get("gurmukhi"):
            titles.append(roman(w["title"]["gurmukhi"]))
        for t in titles:
            k = match_key(t)
            if len(k) >= MIN_KEY:
                known.setdefault(k, w["id"])
    new_titles = {}  # key → the roman title the first entry gave it

    def contains_for(gurmukhi, author=None, composed=None):
        g = _work_title(gurmukhi)
        r = roman(g)
        k = match_key(r)
        if len(k) >= MIN_KEY and k in known:
            return {"work_id": known[k]}
        c = {"work_title": new_titles.setdefault(k, r) if len(k) >= MIN_KEY else r, "gurmukhi": g}
        if author:
            c["authors"] = [author]
        if composed:
            c["composed"] = composed
        return c

    versions = []
    for e in entries:
        meta = CATALOGUES[e["catalogue"]]
        items = e["contents"] or [{"title": e["title"], "author": e["author"]}]
        contains = []
        for n, it in enumerate(items):
            c = contains_for(it["title"], it.get("author"), e["composed"] if n == 0 else None)
            if c not in contains:
                contains.append(c)
        repo = meta["repository"]
        held = None
        if e.get("holder"):
            held = holder(e["holder"])
            repo = held["name"] if held else None
        bits = [e["title"]]
        if repo and e["ms_no"]:
            bits.append(f"{repo} MS {e['ms_no']}")
        if e["folios"]:
            bits.append(f"{e['folios']} ff.")
        label = ", ".join(bits) + f" ({meta['short']}, no. {e['no']})"
        notes = [f"Known from {meta['cite']}, entry {e['no']} (PDF p. {e['page']})."]
        if e["author"] and e["contents"]:
            notes.append(f"Author per header: {e['author']}.")
        if e["place"]:
            notes.append(f"Written at: {e['place']}.")
        if held and held["private"]:
            notes.append("Held in a private collection in 1963.")
        if held and held["inferred"]:
            notes.append(f"Holder '{held['abbr']}' expansion inferred (its key is in vol. 1, not seen).")
        elif e.get("holder") and not held:
            notes.append(f"Holder abbreviation as OCR'd, not in the key: {e['holder']}.")
        if not e["ms_no"]:
            notes.append("The catalogue gives no MS number here (perhaps held in another library).")
        v = {"label": label, "type": "catalogue-record", "availability": "none", "contains": contains,
             "scripts": ["Gurmukhi"]}
        if repo:
            v["repository"] = repo
        if repo and e["ms_no"]:
            v["shelfmark"] = f"MS {e['ms_no']}"
        if e["copied"] and e["ocr_doubt"]:
            notes.append(f"Copy date as OCR'd, doubtful: {e['copied']}.")
        elif e["copied"]:
            v["date"] = e["copied"]
        people = [f"{e['scribe']} (scribe)"] if e["scribe"] else []
        if e["translator"]:
            people.append(f"{e['translator']} (translator)")
        if people:
            v["contributors"] = "; ".join(people)
        v["notes"] = " ".join(notes)
        versions.append(v)
    return {"versions": versions}


def main(argv) -> None:
    if not argv:
        sys.exit(__doc__)
    if argv[0] == "parse":
        ocr_dir, key = argv[1], argv[2]
        style = argv[3] if len(argv) > 3 else "sgpc"
        pages = {}
        for name in sorted(os.listdir(ocr_dir)):
            m = re.fullmatch(r"(\d+)\.txt", name)
            if m:
                with open(os.path.join(ocr_dir, name), encoding="utf-8") as f:
                    pages[int(m.group(1))] = f.read()
        for e in parse_entries(pages, style=style):
            print(json.dumps({"catalogue": key, **e}, ensure_ascii=False))
    elif argv[0] == "import":
        from candidates import add
        from schema import load, save
        date = argv[argv.index("--date") + 1]
        cat = load()
        for path in [a for a in argv[1:argv.index("--date")]]:
            with open(path, encoding="utf-8") as f:
                entries = [json.loads(ln) for ln in f if ln.strip()]
            key = entries[0]["catalogue"]
            rep = add(cat, to_finds(entries, cat), date, f"ashok-{key}")
            print(key, {k: len(v) for k, v in rep.items()})
        save(cat)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
