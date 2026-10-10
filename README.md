# ਗੁਰਬਾਣੀ ਖੋਜ ਕੋਸ਼ — Gurbani Search Dictionary

The dictionary half of the site at [search.atthebunga.com](https://search.atthebunga.com) (repo name: `gurmukhi-kosh`).

A dictionary of Sri Guru Granth Sahib: an entry for every unique word in the text, with grammar,
etymology, definitions, and a link to every place the word occurs in scripture. The aim is a
word-by-word reference that makes Gurbani readable for learners, not just searchable.

## What's inside

- **Every word**: unique Gurmukhi word forms across all 1430 angs, with occurrence counts.
- **Definitions**: multiple senses per word, drawn from classical Gurmukhi lexicography.
- **Grammar**: part of speech, gender, number, and case where a source states them. Inflected
  forms are grouped under their headword where Shackle's glossary lists them (about 1,900 words);
  nothing is inferred from spelling.
- **Etymology**: origin chains for each word.
- **Concordance**: every line a word appears in, with its position.

## Stack

Next.js (App Router), TypeScript, Tailwind CSS, backed by a Postgres (Supabase) database. An
ingestion pipeline builds the corpus and dictionary tables from public Gurbani data sources.

## Run locally

```bash
cp env.example .env.local    # add your Supabase credentials
npm install
npm run dev                  # http://localhost:3000
```

---

One of a suite of Gurmukhi and Gurbani tools. More at [thehimmat.com](https://thehimmat.com).
