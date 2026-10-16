const BASE_URL = "https://api.banidb.com/v2";

export type BaniDBVerse = {
  verseId: number;
  shabadId: number;
  verse: {
    gurmukhi: string;
    unicode: string;
  };
  translation: {
    en?: { bdb?: string; ms?: string; ssk?: string };
    // Punjabi teekas/commentaries; each is { gurmukhi, unicode }.
    //   ss = Sahib Singh (Darpan arth), pss = Sahib Singh pad-arth,
    //   ft = Faridkot Teeka, ms = Manmohan Singh.
    pu?: Record<string, { gurmukhi?: string; unicode?: string } | undefined>;
  };
  transliteration: {
    english: string;
  };
  // Pause marks per set; p is the word index (sometimes a string), t "v"
  // (main) or "y" (yamki). Normalised by lib/vishraam.ts.
  visraam?: Record<string, { p: number | string; t: string }[]>;
  pageNo: number;
  lineNo: number;
  writer: {
    writerId: number;
    english: string;
    gurmukhi?: string;
  };
  raag: {
    english?: string;
    unicode?: string;
  };
};

export type BaniDBAng = {
  count: number;
  page: BaniDBVerse[];
};

// BaniDB SourceIDs (GET /v2/sources): G = Sri Guru Granth Sahib Ji,
// B = Bhai Gurdas Ji Vaaran, D = Dasam Bani, N = Bhai Nand Lal Ji.
// (A = Amrit Keertan is a compilation of the others — never a corpus here.)
// For non-SGGS sources an "ang" is the source's own page unit (B: the vaar).
export type BaniDBSourceId = "G" | "B" | "D" | "N";

export async function fetchAng(ang: number, source: BaniDBSourceId = "G"): Promise<BaniDBAng> {
  const res = await fetch(`${BASE_URL}/angs/${ang}/${source}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`BaniDB fetch failed for ang ${ang}/${source}: ${res.status}`);
  return res.json();
}

export async function fetchShabad(shabadId: number) {
  const res = await fetch(`${BASE_URL}/shabads/${shabadId}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`BaniDB fetch failed for shabad ${shabadId}: ${res.status}`);
  return res.json();
}

// A bani (e.g. Japji Sahib) groups verses across angs. Each entry nests the
// verse under a `verse` key. Its `verseId` is NOT our `lines.verse_id`: the
// banis endpoint numbers verses its own way (Japji's Mul Mantar is 12 here,
// 1 from /angs), so match by page and text (lib/passages.ts). `paragraph`
// numbers the units the bani is read in (#219).
export type BaniDBBaniVerse = {
  paragraph?: number;
  header?: number;
  verse: {
    verseId: number;
    pageNo: number;
    lineNo: number;
    verse?: { gurmukhi: string; unicode: string };
  };
};

export type BaniDBBani = {
  baniInfo: {
    baniID?: number;
    unicode?: string;
    english?: string;
    source?: { sourceId?: BaniDBSourceId | "A" };
  } | null;
  verses: BaniDBBaniVerse[];
};

export type BaniDBBaniListing = { ID: number; token: string; gurmukhiUni: string; transliteration?: string };

export async function fetchBanis(): Promise<BaniDBBaniListing[]> {
  const res = await fetch(`${BASE_URL}/banis`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`BaniDB fetch failed for the bani list: ${res.status}`);
  return res.json();
}

export async function fetchBani(baniId: number): Promise<BaniDBBani> {
  const res = await fetch(`${BASE_URL}/banis/${baniId}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`BaniDB fetch failed for bani ${baniId}: ${res.status}`);
  return res.json();
}
