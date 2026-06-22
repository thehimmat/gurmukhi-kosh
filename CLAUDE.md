# Gurmukhi Kosh

## Project Overview
Next.js + Supabase dictionary app that ingests Gurmukhi texts (starting with SGGS) and generates
detailed dictionary entries for each unique word, with references to every occurrence in the source.

## Supabase Project
- Project ID: `brczghxvpfikezsevbkh`
- Region: us-west-1
- Dashboard: https://supabase.com/dashboard/project/brczghxvpfikezsevbkh

## Database Schema

### Scripture tables (migration 001)
- `sources` — ingestion source records (code, name, version, ingested_at)
- `words` — unique Gurmukhi word forms with occurrence frequency
- `shabads` — hymn metadata (raag, writer, starting ang)
- `lines` — individual verses; UNIQUE(source_fk, verse_id)
- `word_occurrences` — every word × line pair with position
- `mahan_kosh_refs` — legacy (empty); superseded by `definitions`

### Dictionary tables (migration 002)
- `dict_sources` — dictionary source records (code, name, language, ingested_at)
- `definitions` — one row per sense per dictionary per word; UNIQUE(word_id, dict_source_id, sense_number)
- `etymology` — origin chain for a word; UNIQUE(word_id, order_index)
- `word_grammar` — POS, gender, number, case; linked optionally to a definition sense
- `lexemes` — canonical grouping for a set of inflected forms
- `word_forms` — maps surface form → lexeme with inflection description

## Data Sources
- **SGGS via BaniDB API** (`https://api.banidb.com/v2`) — 1430 angs, source code `sggs_banidb_v2`
- **Mahan Kosh** — scraped from `backend.searchgurbani.com/api/res/mahan-kosh/view`, dict_source code `mahan_kosh`
- **Manual annotations** — hand-authored YAML, dict_source code `manual`

## Pipeline

All ingestion lives in `pipeline/` (not `scripts/`):

```
pipeline/
  shared/
    utils.ts         # sleep(), parseArgs(), progress()
    db.ts            # re-exports supabaseAdmin()
  sggs/
    ingest.ts        # BaniDB → Supabase (words, lines, occurrences)
  mahan-kosh/
    scrape.py        # Phase 1: API → JSONL checkpoint
    ingest.ts        # Phase 2: JSONL → definitions table
    output/          # .gitignored; holds entries.jsonl
  manual/
    ingest.ts        # entries.yaml → definitions table (stub)
    data/            # hand-authored YAML goes here
```

### npm scripts
- `npm run ingest` / `npm run ingest:sggs` — full SGGS (angs 1–1430)
- `npm run ingest:sggs:range -- --start=1 --end=50` — range
- `npm run ingest:mahankosh` — load entries.jsonl into definitions table
- `npm run ingest:manual` — load manual annotations (stub)

### Mahan Kosh two-phase process
1. Run `python3 pipeline/mahan-kosh/scrape.py` (checkpointed; ~2.5h for all 29k words)
2. Run `npm run ingest:mahankosh` (idempotent upserts; ~30s)

## Shared Gurmukhi Input Package
Keyboard transliteration lives in the suite-level shared package.

- Package: `@atthebunga/gurmukhi-input` — linked via npm workspaces from `../shared/gurmukhi-input/`
- Import: `import { useGurmukhiInput, GurmukhiInput } from '@atthebunga/gurmukhi-input'`
- Source files: `../shared/gurmukhi-input/` (keymap, hook, component)
- To modify the keyboard mapping: edit `../shared/gurmukhi-input/keymap.ts`
- The search input on `app/page.tsx` uses `useGurmukhiInput` — transliteration is always-on.

## Key Library Files
- `lib/supabase.ts` — lazy Supabase client + all TypeScript types
- `lib/banidb.ts` — BaniDB API fetch helpers
- `lib/tokenizer.ts` — Gurmukhi Unicode tokenizer

## Pages & Routes
- `/` — search home with live dropdown results
- `/word/[gurmukhi]` — full dictionary entry: definitions, grammar, etymology, morphological variants, occurrences
- `/api/word/[gurmukhi]` — JSON API returning word data for external consumers
- `/api/search` — prefix + substring word search (used by home page dropdown)
- `/ang/[ang]` — browse a specific ang with all lines, translations, transliterations
- `/browse` — paginated frequency-sorted word list

## Design
- Fonts: Crimson Pro (body), Inter (UI), Noto Sans Gurmukhi (Gurmukhi text)
- Color palette: warm parchment tones, deep brown accent (`var(--accent)`)
- All dynamic pages use `export const dynamic = "force-dynamic"`

## Part of Gurmukhi Suite
Located at `/Users/himmat/code/gurmukhi/gurmukhi-kosh`.
Update `../APP_INTERACTIONS.md` when new integration points are established.

## Deployment
Vercel-ready. Required env vars:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (pipeline only — not needed on Vercel)
