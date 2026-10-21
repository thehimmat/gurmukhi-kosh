"""Classify a PDF's text layer for the Drive inventory.

Input is what can be learnt about a file without reading it page by page:
`pdffonts` output (when the file was small enough to download) and a sample of
its text (`pdftotext`, or Drive's own extraction for larger files, which does
not OCR). Output says whether the file has a text layer, and if so whether it
is Unicode Gurmukhi, a legacy Gurmukhi font (which one), Latin script, or bad
OCR.

Legacy fonts are recognised by gurmukhi-transliterate: by font name
(`encoding_for_font`) when fonts are known, else from the text itself
(`detect_lines`).
"""

import re
from collections import Counter
from dataclasses import dataclass, field

from gurmukhi_transliterate.legacy import ENCODINGS, GurmukhiLegacy

# Fewer non-space characters per page than this is page numbers or a
# scanner's stamp, not a text layer.
MIN_CHARS_PER_PAGE = 20
# Share of letters in a script for the text to count as written in it.
SCRIPT_SHARE = 0.3
# Gurmukhi counts at a lower share: bani sheets and steeks print each line
# beside a longer transliteration or translation.
GURMUKHI_SHARE = 0.05
GURMUKHI_MIN_CHARS = 100
# Legacy text found from the text alone: lines checked, and how many confident
# legacy lines it takes.
MAX_DETECT_LINES = 2000
LEGACY_MIN_SCORE = 0.8
LEGACY_MIN_LINES = 5
LEGACY_MIN_SHARE = 0.03
# Share of Gurmukhi syllables that break spelling rules for OCR to count as bad.
GARBLED_SHARE = 0.15

# Fonts that carry Unicode or plain Latin text, so are never a legacy-font gap.
UNICODE_FONT_PREFIXES = (
    "arial", "calibri", "cambria", "times", "helvetica", "courier", "symbol", "zapf",
    "garamond", "georgia", "verdana", "tahoma", "segoe", "dejavu", "liberation",
    "noto", "raavi", "gurmukhisangam", "mukta", "anmoluni", "saab", "lohit", "akaash",
    "mangal", "glyphless", "minion", "myriad", "palatino", "bookman", "book", "century",
    "trebuchet", "wingdings", "cour", "nirmala", "kokila", "aparajita", "arialunicode",
)

_SCRIPTS = {
    "gurmukhi": (0x0A00, 0x0A7F),
    "devanagari": (0x0900, 0x097F),
    "arabic": (0x0600, 0x06FF),
}
_ARABIC_EXTRA = ((0x0750, 0x077F), (0xFB50, 0xFDFF), (0xFE70, 0xFEFF))

STAMP_MIN_PAGES = 6
# Scanner and library stamps: text a page-image PDF carries without a text layer.
WATERMARKS = re.compile(
    r"egangotri|camscanner|digiti[sz]ed by|google|dharmartha trust|raghunath temple|"
    r"namdhari e-?library|panjab digital library|archive\.org|internet archive|"
    r"scanned (by|with)|cc-0\.|public domain|sikh ?heritage|ocr by|adobe",
    re.I)

_VOWEL_SIGNS = set("ਾਿੀੁੂੇੈੋੌ")
_NASALS = set("ਂੰ")
_CONSONANT = re.compile(r"[ਕ-ਹਖ਼-ੜਫ਼ੲੳਅ-ਔ]")


@dataclass(frozen=True)
class Font:
    name: str
    uni: bool = False


@dataclass
class Classification:
    text_layer: str            # none | unicode | legacy | mixed | latin | garbled
    encodings: list[str] = field(default_factory=list)       # legacy layouts found
    unknown_fonts: list[str] = field(default_factory=list)   # possibly Gurmukhi, no converter
    scripts: dict[str, float] = field(default_factory=dict)  # share of letters per script
    chars: int = 0                                           # non-space characters sampled


def parse_pdffonts(output: str) -> list[Font]:
    """Fonts from `pdffonts` output (name and its `uni` column)."""
    fonts = []
    for line in output.splitlines()[2:]:
        cols = line.split()
        if len(cols) < 7:
            continue
        # columns from the right: emb sub uni objnum gen
        fonts.append(Font(cols[0], uni=cols[-3] == "yes"))
    return fonts


def _script_shares(text: str) -> dict[str, float]:
    counts = Counter()
    for ch in text:
        cp = ord(ch)
        for name, (lo, hi) in _SCRIPTS.items():
            if lo <= cp <= hi:
                counts[name] += 1
                break
        else:
            if any(lo <= cp <= hi for lo, hi in _ARABIC_EXTRA):
                counts["arabic"] += 1
            elif ch.isascii() and ch.isalpha() or "À" <= ch <= "ɏ":
                counts["latin"] += 1
    total = sum(counts.values()) or 1
    return {s: counts[s] / total for s in ("gurmukhi", "devanagari", "arabic", "latin")}


def _garbled_share(text: str) -> float:
    """Share of Gurmukhi words with a vowel sign or nasal that has no letter to sit on,
    or two vowel signs in a row: what bad OCR of Gurmukhi produces."""
    words = [w for w in re.findall(r"[਀-੿]+", text)]
    if not words:
        return 0.0
    bad = 0
    for w in words:
        prev = None
        for ch in w:
            if ch in _VOWEL_SIGNS and (prev is None or prev in _VOWEL_SIGNS):
                bad += 1
                break
            if ch in _NASALS and prev is None:
                bad += 1
                break
            prev = ch
    return bad / len(words)


def strip_stamps(text: str, pages: int) -> str:
    """Drop watermark lines, and any line printed on most pages (a stamp or running
    head), so a page-image PDF with a stamp in its text layer reads as having none."""
    lines = text.splitlines()
    counts = Counter(l.strip() for l in lines if l.strip())
    # Only a sample of several pages can show a line recurring page after page.
    repeated = pages // 2 if pages >= STAMP_MIN_PAGES else float("inf")
    return "\n".join(l for l in lines
                     if not WATERMARKS.search(l) and counts.get(l.strip(), 0) < repeated)


def _is_unicode_font(name: str) -> bool:
    bare = re.sub(r"^[A-Z]{6}\+", "", name).lower().replace("-", "").replace(" ", "")
    return bare.startswith(UNICODE_FONT_PREFIXES) or bare in ("[none]", "")


def _encodings_from_text(text: str) -> list[str]:
    """Legacy layouts found in Latin-looking text, most lines first. A steek or a
    translation may hold only a little verse among its prose, so a small share of
    confidently legacy lines is enough."""
    # A line with no lower case is a heading in capitals, which reads as valid
    # AnmolLipi; legacy Gurmukhi always mixes cases.
    lines = [l for l in text.splitlines() if len(l.strip()) >= 8 and re.search(r"[a-z]", l)]
    if len(lines) > MAX_DETECT_LINES:
        step = len(lines) / MAX_DETECT_LINES
        lines = [lines[int(i * step)] for i in range(MAX_DETECT_LINES)]
    if not lines:
        return []
    guesses = GurmukhiLegacy.detect_lines("\n".join(lines))
    legacy = Counter(g.label for g in guesses if g.label in ENCODINGS and g.score >= LEGACY_MIN_SCORE)
    if sum(legacy.values()) < max(LEGACY_MIN_LINES, LEGACY_MIN_SHARE * len(lines)):
        return []
    return [k for k, _ in legacy.most_common()]


def classify(fonts: list[Font] | None, text: str, pages: int) -> Classification:
    """Classify a text layer from its fonts (None when unknown) and a text sample
    covering *pages* pages."""
    text = strip_stamps(text, pages)
    chars = len(re.sub(r"\s", "", text))
    scripts = _script_shares(text)
    font_encodings: list[str] = []
    unknown: list[str] = []
    for f in fonts or []:
        enc = GurmukhiLegacy.encoding_for_font(f.name)
        if enc:
            if enc not in font_encodings:
                font_encodings.append(enc)
        elif not f.uni and not _is_unicode_font(f.name):
            bare = re.sub(r"^[A-Z]{6}\+", "", f.name)
            if bare not in unknown:
                unknown.append(bare)

    result = Classification("none", unknown_fonts=unknown, scripts=scripts, chars=chars)
    if chars < MIN_CHARS_PER_PAGE * max(pages, 1) and chars < 200:
        return result

    gurmukhi_chars = sum(1 for ch in text if "\u0A00" <= ch <= "\u0A7F")
    unicode_gurmukhi = scripts["gurmukhi"] >= GURMUKHI_SHARE and gurmukhi_chars >= GURMUKHI_MIN_CHARS
    encodings = font_encodings or (_encodings_from_text(text) if scripts["latin"] >= SCRIPT_SHARE else [])
    result.encodings = encodings

    if unicode_gurmukhi and encodings:
        result.text_layer = "mixed"
    elif unicode_gurmukhi:
        result.text_layer = "garbled" if _garbled_share(text) > GARBLED_SHARE else "unicode"
    elif encodings:
        result.text_layer = "legacy"
    elif scripts["latin"] >= SCRIPT_SHARE:
        result.text_layer = "latin"
    elif scripts["devanagari"] >= SCRIPT_SHARE or scripts["arabic"] >= SCRIPT_SHARE:
        result.text_layer = "unicode"
    return result
