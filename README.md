# Gurmukhi Kosh

A dictionary of Sri Guru Granth Sahib: an entry for every unique word in the text, with grammar,
etymology, definitions, and a link to every place the word occurs in scripture. The aim is a
word-by-word reference that makes Gurbani readable for learners, not just searchable.

## What's inside

- **Every word** — unique Gurmukhi word forms across all 1430 angs, with occurrence counts.
- **Definitions** — multiple senses per word, drawn from classical Gurmukhi lexicography.
- **Grammar** — part of speech, gender, number, and case, with inflected forms grouped under a
  canonical lexeme.
- **Etymology** — origin chains for each word.
- **Concordance** — every line a word appears in, with its position.

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS, backed by a Postgres (Supabase) database. An
ingestion pipeline builds the corpus and dictionary tables from public Gurbani data sources.

## Run locally

```bash
cp env.example .env.local    # add your Supabase credentials
npm install
npm run dev                  # http://localhost:3000
```

---

One of a suite of Gurmukhi / Gurbani tools. More at [thehimmat.com](https://thehimmat.com).
