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

export async function fetchAng(ang: number): Promise<BaniDBAng> {
  const res = await fetch(`${BASE_URL}/angs/${ang}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`BaniDB fetch failed for ang ${ang}: ${res.status}`);
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
// verse under a `verse` key; `verseId` matches our `lines.verse_id`.
export type BaniDBBaniVerse = {
  verse: {
    verseId: number;
    pageNo: number;
    lineNo: number;
  };
};

export type BaniDBBani = {
  baniInfo: unknown;
  verses: BaniDBBaniVerse[];
};

export async function fetchBani(baniId: number): Promise<BaniDBBani> {
  const res = await fetch(`${BASE_URL}/banis/${baniId}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`BaniDB fetch failed for bani ${baniId}: ${res.status}`);
  return res.json();
}
