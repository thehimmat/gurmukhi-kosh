const BASE_URL = "https://api.banidb.com/v2";

export type BaniDBVerse = {
  verseId: number;
  shabadId: number;
  verse: {
    gurmukhi: string;
    unicode: string;
  };
  translation: {
    en?: { bdb?: string; ms?: string };
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
