import { describe, it, expect } from "vitest";
import {
  firstLetters,
  toBaniDBKey,
  queryKeys,
  lineSimilarity,
  classifySection,
  searchBaniDB,
  crossReferenceSection,
  type BaniDBVerse,
} from "../pipeline/scans/crossref";

describe("firstLetters", () => {
  it("takes the first letter of each word", () => {
    expect(firstLetters("ਹਵਾਇ ਬੰਦਗੀ ਆਵੁਰਦ ਦਰ ਵਜੂਦ ਮਰਾ")).toBe("ਹਬਅਦਵਮ");
  });

  it("maps independent vowels to their carrier (ਅ / ੲ / ੳ)", () => {
    expect(firstLetters("ਆਵੁਰਦ ਐਨ ਔਰ ਇਕ ਈਸ਼ ਏਕ ਉਮਰ ਊਚ ਓਹ")).toBe("ਅਅਅੲੲੲੳੳੳ");
  });

  it("keeps nukta letters distinct (BaniDB indexes ਜ਼ apart from ਜ)", () => {
    expect(firstLetters("ਖ਼ੁਸ਼ ਅਸਤ ਉਮਰ ਕਿ")).toBe("ਖ਼ਅੳਕ".normalize("NFD"));
    expect(firstLetters("ਜ਼ੀਸਤ".normalize("NFC"))).toBe("ਜ਼".normalize("NFD"));
  });

  it("ignores punctuation, vishraams, verse numbers and Latin text", () => {
    expect(firstLetters("ਸੋਚੈ ਸੋਚਿ ਨ ਹੋਵਈ ॥ ੧ ॥ (note) 12, ਜੇ; ਸੋਚੀ")).toBe("ਸਸਨਹਜਸ");
  });

  it("keeps a hyphenated compound as one word", () => {
    expect(firstLetters("ਬ-ਯਾਦ ਦੋਸਤ")).toBe("ਬਦ");
  });

  it("returns an empty string when there are no Gurmukhi words", () => {
    expect(firstLetters("॥ ੧ ॥ 42")).toBe("");
  });
});

describe("toBaniDBKey", () => {
  it("encodes first letters in BaniDB's ASCII letter codes", () => {
    expect(toBaniDBKey("ਹਬਅਦਵਮ")).toBe("hbAdvm");
    expect(toBaniDBKey("ਯਤਗਨਤਜ਼")).toBe("Xqgnqz");
    expect(toBaniDBKey("ਖ਼ਗ਼ਫ਼ਸ਼ੳੲ")).toBe("^Z&Sae");
  });

  it("throws on a letter it cannot encode rather than sending a wrong query", () => {
    expect(() => toBaniDBKey("ਕx")).toThrow(/x/);
  });
});

describe("queryKeys", () => {
  it("tries the exact key, then without nukta, then hyphen-split", () => {
    expect(queryKeys("ਬ-ਗ਼ੈਰ ਯਾਦਿ ਤੋ ਗੋਇਆ ਨਮੇ ਤਵਾਨਮ ਜ਼ੀਸ੍ਤ")).toEqual([
      "bXqgnqz",
      "bXqgnqj",
      "bZXqgnqz",
      "bgXqgnqj",
    ]);
  });

  it("adds a leading and trailing window for long lines, so a line split differently still hits", () => {
    const keys = queryKeys("ਕ ਖ ਗ ਘ ਚ ਛ ਜ ਝ ਟ ਠ");
    expect(keys).toEqual(["kKgGcCjJtT", "kKgGcC", "cCjJtT"]);
  });

  it("returns nothing for a line too short to mean anything", () => {
    expect(queryKeys("ਸੋ ਸੋ")).toEqual([]);
  });
});

describe("lineSimilarity", () => {
  it("is 1 for identical lines regardless of punctuation and spacing", () => {
    expect(lineSimilarity("ਹਵਾਇ ਬੰਦਗੀ, ਆਵੁਰਦ ॥੧॥", "ਹਵਾਇ  ਬੰਦਗੀ ਆਵੁਰਦ")).toBe(1);
  });

  it("treats nukta- and halant-only differences as identical", () => {
    expect(lineSimilarity("ਖ਼ੁਸ਼ ਅਸ੍ਤ", "ਖੁਸ਼ ਅਸਤ")).toBe(1);
  });

  it("scores a scan line found inside a longer BaniDB line as a full match", () => {
    expect(lineSimilarity("ਖੁਸ਼ ਅਸਤ ਉਮਰ", "ਖੁਸ਼ ਅਸਤ ਉਮਰ ਕਿਹ ਦਰ ਯਾਦ ਬਿਗੁਜ਼ਰਦ ਵਰਨਾ")).toBe(1);
  });

  it("stays above the match threshold across transliteration conventions (ਤੋ/ਤੂ, ਨਮੇ/ਨਮੀ)", () => {
    expect(
      lineSimilarity("ਬ-ਗ਼ੈਰ ਯਾਦਿ ਤੋ, ਗੋਇਆ, ਨਮੇ ਤਵਾਨਮ ਜ਼ੀਸ੍ਤ", "ਬਗ਼ੈਰ ਯਾਦਿ ਤੂ ਗੋਯਾ ਨਮੀ ਤਵਾਨਮ ਜ਼ੀਸਤ"),
    ).toBeGreaterThanOrEqual(0.7);
  });

  it("is high but below 1 for a one-letter variant reading", () => {
    const s = lineSimilarity("ਹਵਾਏ ਬੰਦਗੀ ਆਵੁਰਦ ਦਰ ਵਜੂਦ ਮਰਾ", "ਹਵਾਇ ਬੰਦਗੀ ਆਵੁਰਦ ਦਰ ਵਜੂਦ ਮਰਾ");
    expect(s).toBeGreaterThan(0.9);
    expect(s).toBeLessThan(1);
  });

  it("is low for unrelated lines", () => {
    expect(lineSimilarity("ਸੋਚੈ ਸੋਚਿ ਨ ਹੋਵਈ", "ਹਵਾਇ ਬੰਦਗੀ ਆਵੁਰਦ")).toBeLessThan(0.5);
  });

  it("is 0 when either side is empty", () => {
    expect(lineSimilarity("", "ਸੋਚੈ")).toBe(0);
  });
});

describe("classifySection", () => {
  it("is online when nearly every sampled line has a close match", () => {
    expect(classifySection([1, 0.97, 0.95, 1])).toBe("online");
  });

  it("is partial when only some lines match", () => {
    expect(classifySection([1, 0.95, 0.2, 0.1])).toBe("partial");
  });

  it("is not_found when no line matches", () => {
    expect(classifySection([0.3, 0.1, 0])).toBe("not_found");
  });

  it("is not_found for an empty sample", () => {
    expect(classifySection([])).toBe("not_found");
  });
});

const verse = (unicode: string, shabadId: number, sourceId = "N"): BaniDBVerse => ({
  unicode,
  sourceId,
  shabadId,
  verseId: shabadId * 10,
  pageNo: 1,
});

function fakeFetch(byQuery: Record<string, unknown>) {
  const calls: string[] = [];
  const fn = async (url: string) => {
    calls.push(url);
    const q = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
    const body = byQuery[q] ?? { resultsInfo: { totalResults: 0 }, verses: [] };
    return { ok: true, status: 200, json: async () => body } as Response;
  };
  return { fn, calls };
}

describe("searchBaniDB", () => {
  it("queries first letters anywhere across all sources and maps verses", async () => {
    const { fn, calls } = fakeFetch({
      "hbAdvm": {
        resultsInfo: { totalResults: 1 },
        verses: [
          {
            verseId: 300001,
            shabadId: 30000,
            pageNo: 1,
            verse: { unicode: "ਹਵਾਇ ਬੰਦਗੀ ਆਵੁਰਦ ਦਰ ਵਜੂਦ ਮਰਾ" },
            source: { sourceId: "N" },
          },
        ],
      },
    });
    const res = await searchBaniDB("hbAdvm", { fetch: fn });
    expect(res).toEqual([
      { unicode: "ਹਵਾਇ ਬੰਦਗੀ ਆਵੁਰਦ ਦਰ ਵਜੂਦ ਮਰਾ", sourceId: "N", shabadId: 30000, verseId: 300001, pageNo: 1 },
    ]);
    const url = new URL(calls[0]);
    expect(url.host).toBe("api.banidb.com");
    expect(url.searchParams.get("searchtype")).toBe("1");
    expect(url.searchParams.get("source")).toBe("all");
  });

  it("throws on a non-OK response so a lookup failure is never read as 'not online'", async () => {
    const fn = async () => ({ ok: false, status: 503, json: async () => ({}) }) as Response;
    await expect(searchBaniDB("hbA", { fetch: fn })).rejects.toThrow(/503/);
  });
});

describe("crossReferenceSection", () => {
  it("finds the best match per line and names the dominant shabad", async () => {
    const lines = ["ਹਵਾਏ ਬੰਦਗੀ ਆਵੁਰਦ ਦਰ ਵਜੂਦ ਮਰਾ", "ਖ਼ੁਸ਼ ਅਸਤ ਉਮਰ ਕਿਹ ਦਰ ਯਾਦ ਬਿਗੁਜ਼ਰਦ"];
    const { fn } = fakeFetch({
      "hbAdvm": { verses: [{ verseId: 1, shabadId: 30000, pageNo: 1, verse: { unicode: "ਹਵਾਇ ਬੰਦਗੀ ਆਵੁਰਦ ਦਰ ਵਜੂਦ ਮਰਾ" }, source: { sourceId: "N" } }] },
      "^AakdXb": { verses: [{ verseId: 2, shabadId: 30000, pageNo: 1, verse: { unicode: "ਖੁਸ਼ ਅਸਤ ਉਮਰ ਕਿਹ ਦਰ ਯਾਦ ਬਿਗੁਜ਼ਰਦ" }, source: { sourceId: "N" } }] },
    });
    const r = await crossReferenceSection(lines, { fetch: fn });
    expect(r.status).toBe("online");
    expect(r.sourceId).toBe("N");
    expect(r.shabadIds).toEqual([30000]);
    expect(r.lines[0].best?.verseId).toBe(1);
    expect(r.lines[0].similarity).toBeLessThan(1); // ਹਵਾਏ vs ਹਵਾਇ: a variant to record
    expect(r.variants).toEqual([
      { scan: lines[0], banidb: "ਹਵਾਇ ਬੰਦਗੀ ਆਵੁਰਦ ਦਰ ਵਜੂਦ ਮਰਾ", verseId: 1, similarity: r.lines[0].similarity },
    ]);
  });

  it("reports not_found when nothing comes back", async () => {
    const { fn } = fakeFetch({});
    const r = await crossReferenceSection(["ਕੋਈ ਅਣਜਾਣ ਤੁਕ ਹੈ"], { fetch: fn });
    expect(r.status).toBe("not_found");
    expect(r.shabadIds).toEqual([]);
    expect(r.variants).toEqual([]);
  });

  it("skips lines too short to query", async () => {
    const { fn, calls } = fakeFetch({});
    await crossReferenceSection(["ਸੋ", "॥ ੧ ॥"], { fetch: fn });
    expect(calls).toEqual([]);
  });
});
