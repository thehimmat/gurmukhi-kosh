#!/usr/bin/env python3
"""
Mahan Kosh scraper — Phase 1 of the Mahan Kosh pipeline.

Reads all words from the Supabase `words` table, looks each one up in the
searchgurbani.com Mahan Kosh API, and writes matching entries to
pipeline/mahan-kosh/output/entries.jsonl.

Usage (from gurmukhi-kosh project root):
  python3 pipeline/mahan-kosh/scrape.py             # full run (all words)
  python3 pipeline/mahan-kosh/scrape.py --limit=100 # test on first 100 words

Checkpointing:
  - Already-scraped words are skipped on resume.
  - "no match" words are recorded with {"gurmukhi": "...", "found": false}.
  - Re-run any time safely.

Requires in .env.local:
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
"""

import os, sys, json, time, re, argparse
import requests

OUTPUT_PATH = "pipeline/mahan-kosh/output/entries.jsonl"
MK_API_BASE = "https://backend.searchgurbani.com/api/res/mahan-kosh/view"
DELAY_S = 0.30   # polite delay between requests
PAGE_SIZE = 1000  # Supabase batch size


# ---------------------------------------------------------------------------
# Env loading
# ---------------------------------------------------------------------------

def load_env(path=".env.local"):
    env = {}
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return env


# ---------------------------------------------------------------------------
# Supabase word list
# ---------------------------------------------------------------------------

def fetch_all_words(supabase_url: str, anon_key: str) -> list[dict]:
    words = []
    offset = 0
    headers = {
        "apikey": anon_key,
        "Authorization": f"Bearer {anon_key}",
    }
    while True:
        url = (
            f"{supabase_url}/rest/v1/words"
            f"?select=id,gurmukhi"
            f"&order=id.asc"
            f"&offset={offset}"
            f"&limit={PAGE_SIZE}"
        )
        resp = requests.get(url, headers=headers, timeout=30)
        resp.raise_for_status()
        batch = resp.json()
        words.extend(batch)
        print(f"\r  Fetched {len(words)} words...", end="", flush=True)
        if len(batch) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    print()
    return words


# ---------------------------------------------------------------------------
# Mahan Kosh API lookup
# ---------------------------------------------------------------------------

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0",
    "Origin": "https://www.searchgurbani.com",
    "Referer": "https://www.searchgurbani.com/",
    "Accept": "application/json",
})


def lookup_word(word: str) -> dict | None:
    """
    Query the Mahan Kosh API for `word`.
    Returns the first matching API line entry (dict), or None if no match found.
    Matching strategy:
      1. Exact match on `line["word"] == word`
      2. Normalized match: strip trailing short vowels from both sides
    """
    url = f"{MK_API_BASE}?keyword={requests.utils.quote(word)}&alpha=alpha&page=0"
    try:
        resp = SESSION.get(url, timeout=20)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"\n  API error for '{word}': {e}")
        return None

    lines = data.get("lines") or []
    if not lines:
        return None

    # 1. Exact headword match
    for line in lines:
        if line.get("word") == word:
            return line

    # 2. Normalized match: strip trailing vowel marks (common in SGGS vs. dictionary forms)
    # Gurmukhi vowel diacritics: ਾ ਿ ੀ ੁ ੂ ੇ ੈ ੋ ੌ  + ੁ/ੂ (subjoined)
    VOWELS = "ਾਿੀੁੂੇੈੋੌੱੰਂ"
    word_norm = word.rstrip(VOWELS)
    if word_norm:
        for line in lines:
            if line.get("word", "").rstrip(VOWELS) == word_norm:
                return line

    return None


# ---------------------------------------------------------------------------
# Description parsing
# ---------------------------------------------------------------------------

GURMUKHI_DIGITS = "੦੧੨੩੪੫੬੭੮੯"
_DIGIT_MAP = {c: str(i) for i, c in enumerate(GURMUKHI_DIGITS)}


def _gd_to_int(s: str) -> int:
    return int("".join(_DIGIT_MAP.get(c, c) for c in s))


def extract_cross_refs(text: str) -> dict | None:
    """Extract Arabic/Persian bracket refs and language-origin markers."""
    refs = {}

    # Arabic/Persian script in square brackets: [سما]
    for m in re.findall(r"\[([^\]]+)\]", text):
        if re.search(r"[؀-ۿ]", m):
            refs.setdefault("ar_fa", m)

    # Language origin markers common in Mahan Kosh
    lang_markers = {
        "ਸੰ.": "sa",    # Sanskrit
        "ਅ਼.": "ar",    # Arabic
        "ਫ਼ਾ.": "fa",   # Farsi/Persian
        "ਹਿੰ.": "hi",   # Hindi
        "ਪੰ.": "pa",    # Punjabi
        "ਉ.":  "ur",    # Urdu
        "ਦੇਸ਼.": "pa",  # Desi/regional
    }
    for marker, lang in lang_markers.items():
        if marker in text:
            refs.setdefault("origin_lang", lang)

    return refs if refs else None


def parse_senses(description: str) -> list[dict]:
    """
    Split a Mahan Kosh description string into numbered senses.

    Format example:
      "ਸੰ. ਸੰਗ੍ਯਾ- ਵਰ੍ਹਾ. ਸਾਲ। ੨. ਰੁੱਤ. ਮੌਸਮ। ੩. ਅੱਧਾ ਸਾਲ."
    yields senses 1, 2, 3.
    """
    if not description:
        return []

    # Split on danda + Gurmukhi numeral + period
    digit_class = "[" + GURMUKHI_DIGITS + "]"
    parts = re.split(r"।\s*(" + digit_class + r"+)[.]\s*", description)

    senses = []

    # First part is sense 1 (no leading number)
    first = parts[0].strip().rstrip("।").strip()
    if first:
        senses.append({
            "sense_number": 1,
            "definition_text": first,
            "cross_refs": extract_cross_refs(first),
        })

    # Subsequent parts come in (number_str, text) pairs
    i = 1
    while i < len(parts) - 1:
        num_str = parts[i]
        text = parts[i + 1].strip().rstrip("।").strip() if i + 1 < len(parts) else ""
        if text:
            senses.append({
                "sense_number": _gd_to_int(num_str),
                "definition_text": text,
                "cross_refs": extract_cross_refs(text),
            })
        i += 2

    return senses


# ---------------------------------------------------------------------------
# Checkpoint helpers
# ---------------------------------------------------------------------------

def load_checkpoint(path: str) -> set[str]:
    """Return set of gurmukhi words already processed (found or not-found)."""
    done: set[str] = set()
    if not os.path.exists(path):
        return done
    with open(path, encoding="utf-8") as f:
        for line in f:
            try:
                entry = json.loads(line)
                done.add(entry["gurmukhi"])
            except Exception:
                pass
    return done


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Scrape Mahan Kosh entries for SGGS words.")
    parser.add_argument("--limit", type=int, default=0, help="Max words to process (0=all)")
    args = parser.parse_args()

    env = load_env()
    supabase_url = env.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
    anon_key = env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")

    if not supabase_url or not anon_key:
        print("ERROR: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in .env.local")
        sys.exit(1)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

    print(f"Fetching word list from Supabase ({supabase_url})...")
    words = fetch_all_words(supabase_url, anon_key)
    print(f"Total words in DB: {len(words)}")

    if args.limit:
        words = words[: args.limit]
        print(f"Limited to {args.limit} words for this run.")

    done = load_checkpoint(OUTPUT_PATH)
    print(f"Checkpoint: {len(done)} words already processed — will skip these.\n")

    found = 0
    not_found = 0
    errors = 0
    t0 = time.time()

    with open(OUTPUT_PATH, "a", encoding="utf-8") as out:
        for idx, row in enumerate(words):
            word = row["gurmukhi"]

            if word in done:
                continue

            entry = lookup_word(word)

            if entry and entry.get("description"):
                record = {
                    "gurmukhi": word,
                    "found": True,
                    "entry_gurmukhi": entry["word"],
                    "mk_id": entry.get("ID"),
                    "source_url": (
                        f"https://www.searchgurbani.com/mahan-kosh/view"
                        f"?word={requests.utils.quote(word)}"
                    ),
                    "senses": parse_senses(entry["description"]),
                }
                found += 1
            else:
                record = {"gurmukhi": word, "found": False}
                not_found += 1

            out.write(json.dumps(record, ensure_ascii=False) + "\n")
            out.flush()

            # Progress line
            elapsed = time.time() - t0
            processed = idx + 1
            total = len(words)
            rate = processed / elapsed if elapsed > 0 else 1
            eta = (total - processed) / rate
            print(
                f"\r[{elapsed:6.0f}s] {processed}/{total} "
                f"| found:{found} no-match:{not_found} errors:{errors} "
                f"| ETA:{eta:.0f}s",
                end="",
                flush=True,
            )

            time.sleep(DELAY_S)

    print(f"\n\nDone.")
    print(f"  Found entries:   {found}")
    print(f"  No match:        {not_found}")
    print(f"  Errors:          {errors}")
    print(f"  Output:          {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
