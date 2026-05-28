/**
 * Mahan Kosh ingestion pipeline: reads entries.jsonl and populates definitions table.
 *
 * Usage:
 *   npm run ingest:mahankosh
 *
 * Requires pipeline/mahan-kosh/output/entries.jsonl to exist (run scrape.py first).
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

// TODO: implement Phase 2 of Mahan Kosh pipeline
// See APP_INTERACTIONS.md for design notes.
throw new Error("Mahan Kosh ingest not yet implemented. Run scrape.py first.");
