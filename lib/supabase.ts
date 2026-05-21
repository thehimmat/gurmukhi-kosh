import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function getUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
}
function getAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
}

// Lazy singleton — avoids throwing at module-load time during Next.js build
let _client: SupabaseClient | null = null;
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    if (!_client) _client = createClient(getUrl(), getAnonKey());
    return (_client as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export function supabaseAdmin() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(getUrl(), serviceKey, {
    auth: { persistSession: false },
  });
}

export type Word = {
  id: number;
  gurmukhi: string;
  frequency: number;
};

export type Shabad = {
  id: number;
  raag_english: string | null;
  raag_gurmukhi: string | null;
  writer_english: string | null;
  writer_id: number | null;
  ang_start: number;
};

export type Line = {
  id: number;
  verse_id: number;
  shabad_id: number;
  ang: number;
  line_no: number;
  gurmukhi: string;
  translation_en: string | null;
  transliteration_en: string | null;
  source_id: string;
};

export type WordOccurrence = {
  id: number;
  word_id: number;
  line_id: number;
  position: number;
};

export type MahanKoshRef = {
  id: number;
  word_id: number;
  entry_gurmukhi: string | null;
  definition: string | null;
  source_url: string | null;
  notes: string | null;
};

export type OccurrenceWithLine = WordOccurrence & {
  lines: Line & { shabads: Shabad | null };
};
