import { describe, it, expect } from "vitest";
import {
  splitPadas,
  editionFold,
  foldLetters,
  isHeading,
  similarity,
  align,
  classify,
  locate,
  buildPageIndex,
  pagesFor,
} from "../pipeline/scans/collate";

describe("splitPadas", () => {
  it("splits on dandas and attaches the verse numbers that close a half-line", () => {
    const p = splitPadas("ਜਬਿ ਮਾਯਾ ਹਰਿ ਬਪੁ ਧਰ੍ਯੋ ਤਬਿ ਸਭ ਹੀ ਬਿਵਹਾਰ ॥ ਗੁਪਤਿ ਪ੍ਰਗਟਿ ਸਭ ਘਟਿ ਬਿਖੈ ਵਰਤੇ ਰੂਪ ਅਪਾਰ ॥ ੫੯ ॥");
    expect(p.map((x) => x.text)).toEqual([
      "ਜਬਿ ਮਾਯਾ ਹਰਿ ਬਪੁ ਧਰ੍ਯੋ ਤਬਿ ਸਭ ਹੀ ਬਿਵਹਾਰ",
      "ਗੁਪਤਿ ਪ੍ਰਗਟਿ ਸਭ ਘਟਿ ਬਿਖੈ ਵਰਤੇ ਰੂਪ ਅਪਾਰ",
    ]);
    expect(p[0].ref).toBeNull();
    expect(p[1].ref).toBe("59");
  });

  it("joins stanza and running numbers (॥ ੫ ॥ ੩੩੭ ॥ → 5.337)", () => {
    const p = splitPadas("ਲਸਕਰ ਸ਼ਤ੍ਰੁ ਸੰਘਾਰੈ ॥ ੫ ॥ ੩੩੭ ॥ ਸ਼ਿਵ ਬਿਰੰਚ ॥");
    expect(p[0].ref).toBe("5.337");
    expect(p[1].ref).toBeNull();
  });

  it("handles compact numbering, single dandas and line breaks", () => {
    const p = splitPadas("ਚਿਤਵਓ ਅਪਨੀ ਓਰ ॥੩੫॥ ਮਿਹਰ ਫਜਲ ਕੀ\nਨਜਰ ਸੇ । ਚਿਤਵਹੁ");
    expect(p.map((x) => x.text)).toEqual(["ਚਿਤਵਓ ਅਪਨੀ ਓਰ", "ਮਿਹਰ ਫਜਲ ਕੀ ਨਜਰ ਸੇ", "ਚਿਤਵਹੁ"]);
    expect(p[0].ref).toBe("35");
  });

  it("drops stray Latin digits and page markers (OCR noise) from the text", () => {
    expect(splitPadas("ਨੇਕੀ ਬਦੀ 154 [[p13]] ਖੁਸੀਆ ॥")[0].text).toBe("ਨੇਕੀ ਬਦੀ ਖੁਸੀਆ");
  });
});

describe("editionFold", () => {
  it("folds spelling conventions that differ between print and manuscript editions", () => {
    expect(editionFold("ਮਾਯਾ")).toBe(editionFold("ਮਾਇਆ"));
    expect(editionFold("ਕਰਿ")).toBe(editionFold("ਕਰ"));
    expect(editionFold("ਮੁਰਾਰਿ")).toBe(editionFold("ਮੁਰਾਰ"));
    expect(editionFold("ਭਉਜਲ")).toBe(editionFold("ਭੌਜਲ"));
    expect(editionFold("ਸ਼ਤ੍ਰੁ")).toBe(editionFold("ਸਤ੍ਰ"));
    expect(editionFold("ਰੱਛਕ")).toBe(editionFold("ਰਛਕ"));
  });

  it("folds the OCR's subscript-ra / aunkar confusion", () => {
    expect(editionFold("ਪ੍ਰਗਟ")).toBe(editionFold("ਪੁਗਟ"));
  });

  it("folds the manuscript's ਏ endings to the print's ਯ forms (ਜਾਪੀਏ / ਜਾਪੀਯੈ)", () => {
    expect(editionFold("ਜਾਪੀਏ")).toBe(editionFold("ਜਾਪੀਯੈ"));
    expect(editionFold("ਗਾਈਏ")).toBe(editionFold("ਗਾਇਯੈ"));
  });

  it("keeps genuinely different words apart", () => {
    expect(editionFold("ਹਰਿ")).not.toBe(editionFold("ਮਾਇਆ"));
    expect(editionFold("ਸੇਵਕ")).not.toBe(editionFold("ਸੇਵਿ"));
  });

  it("ignores superscript apparatus marks and punctuation left by OCR", () => {
    expect(editionFold("ਦਇਆਲ”")).toBe(editionFold("ਦਇਆਲ"));
    expect(editionFold("ਕਿਰਪਾਸਿੰਧ₹")).toBe(editionFold("ਕਿਰਪਾਸਿੰਧ"));
  });
});

describe("foldLetters / similarity", () => {
  it("ignores word division (larivaar vs padchhed)", () => {
    expect(foldLetters("ਸੁਖ ਸਾਗਰ")).toBe(foldLetters("ਸੁਖਸਾਗਰ"));
    expect(similarity("ਨਿਤ ਨੇਮ ਰਟਤ", "ਨਿਤਨੇਮ ਰਟਤ")).toBe(100);
  });

  it("is high for spelling-only differences and low for different readings", () => {
    expect(similarity("ਕਾਲ ਰੱਛ ਤਾਰਨ ਪ੍ਰਭੂ ਮਾਯਾ ਰੂਪ ਮੁਰਾਰਿ", "ਕਾਲਰਛ ਤਾਰਨ ਪ੍ਰਭੂ ਮਾਇਆ ਰੂਪ ਮੁਰਾਰ")).toBeGreaterThanOrEqual(90);
    expect(
      similarity("ਗੁਪਤਿ ਪ੍ਰਗਟਿ ਸਭ ਘਟਿ ਬਿਖੈ ਵਰਤੇ ਰੂਪ ਅਪਾਰ", "ਜਬ ਰਚਨਾ ਖਿੰਚੀ ਸਕਲ ਤਬ ਆਪੇ ਆਪ ਮੁਰਾਰ"),
    ).toBeLessThan(60);
  });

  it("is 0 against an empty side", () => {
    expect(similarity("", "ਸੋਚੈ")).toBe(0);
  });
});

describe("isHeading", () => {
  it("recognises metre and raag labels", () => {
    expect(isHeading("ਬਿਸਨੁਪਦ ਰਾਗੁ ਭੈਰਉ ਦੂਜੀ ਤਰਹ")).toBe(true);
    expect(isHeading("ਪੰਚਾਲ ਦੋਹਰਾ")).toBe(true);
    expect(isHeading("ਛਪਯ ਛੰਦ")).toBe(true);
    expect(isHeading("ਪਉੜੀ ਚੰਪਕ ਕੀ")).toBe(true);
    expect(isHeading("ਚਉਪਯਾ ਛੰਤ ਅਥ ਸਮਰ ਜਾਤਾ ਸ੍ਰੀ ਵਿਸਨੁ ਕਥਤੇ")).toBe(true);
  });

  it("does not treat verse text as a heading", () => {
    expect(isHeading("ਸਭ ਕਰਤ ਹਰਿ ਕੀ ਸੇਵ")).toBe(false);
  });
});

describe("align", () => {
  const base = ["ਸੁਕ ਬ੍ਯਾਸ ਨਾਰਦ ਦੇਵ", "ਸਭ ਕਰਤ ਹਰਿ ਕੀ ਸੇਵ", "ਸਸਿ ਸੂਰ ਉਡਗਨ ਜੇਤ", "ਸਭ ਰਟਤ ਮਾਯਾ ਨੇਤ"];

  it("pairs identical sequences one to one", () => {
    expect(align(base, base)).toEqual([[0, 0], [1, 1], [2, 2], [3, 3]]);
  });

  it("pairs variant readings in place and leaves insertions unpaired", () => {
    const other = ["ਸੁਕ ਬਿਆਸ ਨਾਰਦ ਦੇਵ", "ਸਭ ਕਰਤ ਮਾਇਆ ਸੇਵ", "ਦੂਜੀ ਤਰਹ", "ਸਸਿ ਸੂਰ ਉਡਗਨ ਜੇਤ", "ਸਭ ਰਟਤ ਮਾਇਆ ਨੇਤ"];
    expect(align(base, other)).toEqual([[0, 0], [1, 1], [null, 2], [2, 3], [3, 4]]);
  });

  it("leaves a base line unpaired when the other side lacks it", () => {
    expect(align(base, [base[0], base[2], base[3]])).toEqual([[0, 0], [1, null], [2, 1], [3, 2]]);
  });

  it("scales to long texts by anchoring on unique matching lines", () => {
    // Lines must differ in letters, not digits (folding drops digits).
    const L = "ਕਖਗਘਚਛਜਝਟਠ";
    const long = Array.from({ length: 3000 }, (_, i) => {
      const d = i.toString().padStart(4, "0").split("").map((c) => L[+c]);
      return `ਸਰਬ ਲੋਹ ${d.join("")}ਾ ਨਾਮ`;
    });
    const other = [...long];
    other.splice(1500, 1);
    const t0 = Date.now();
    const pairs = align(long, other);
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(pairs.find(([a]) => a === 1500)).toEqual([1500, null]);
    expect(pairs.find(([a]) => a === 2999)).toEqual([2999, 2998]);
  });
});

describe("classify", () => {
  it("bands a pair by folded similarity", () => {
    expect(classify("ਕਾਲ ਰੱਛ ਤਾਰਨ ਪ੍ਰਭੂ ਮਾਯਾ ਰੂਪ ਮੁਰਾਰਿ", "ਕਾਲਰਛ ਤਾਰਨ ਪ੍ਰਭੂ ਮਾਇਆ ਰੂਪ ਮੁਰਾਰ")).toBe("same");
    expect(classify("ਤੁਮ ਸਮ ਧਨੀ ਨ ਮੋ ਸਮ ਜਾਚਿਕ ਪ੍ਰਭੁ ਮਾਂਗਉ ਦੇਤ ਦਾਤਾਰੇ", "ਤੁਮ ਸਮ ਧਨੀ ਨ ਮੋ ਸਮ ਜਾਚਿਕ ਪ੍ਰਭ ਦਾਨ ਦੇਹ ਦਾਤਾਰੇ")).toBe("probable");
    expect(classify("ਗੁਪਤਿ ਪ੍ਰਗਟਿ ਸਭ ਘਟਿ ਬਿਖੈ ਵਰਤੇ ਰੂਪ ਅਪਾਰ", "ਜਬ ਰਚਨਾ ਖਿੰਚੀ ਸਕਲ ਤਬ ਆਪੇ ਆਪ ਮੁਰਾਰ")).toBe("definite");
  });

  it("bands a half-line the other edition broke in two as split, not as a variant", () => {
    expect(classify("ਬਿਮਲ ਰਤਨ ਜਗਮਗ ਦੁਤਿ ਕ੍ਰਾਂਤਾ ਸੁਭਗ ਮਨੋਹਰ ਦੁਰਤ ਬਿਧਾਤਾ", "ਬਿਮਲ ਰਤਨ ਜਗਮਗ ਦੁਤਿ ਕ੍ਰਾਂਤਾ")).toBe("split");
    expect(classify("ਸੁਭਗ ਮਨੋਹਰ", "ਬਿਮਲ ਰਤਨ ਜਗਮਗ ਦੁਤਿ ਕ੍ਰਾਂਤਾ ਸੁਭਗ ਮਨੋਹਰ ਦੁਰਤ ਬਿਧਾਤਾ")).toBe("split");
  });

  it("reports headings and missing lines separately", () => {
    expect(classify("ਛਪਯ ਛੰਦ", "ਸਵਯਾ ਛੰਦ")).toBe("heading");
    expect(classify("ਸਭ ਕਰਤ ਹਰਿ ਕੀ ਸੇਵ", null)).toBe("missing");
  });
});

describe("locate", () => {
  const padas = splitPadas(
    "ਮਾਧੋ ਦੋਹਰਾ ॥ ਫੂਲ ਫਲ ਬਿਰਖਾ ਤੁਹੀਂ ਤੁਹੀਂ ਸਭਨ ਕੀ ਸਾਰ ॥ ਤੁਮ ਸਭ ਕੋ ਪੈਦਾ ਕਰੋ ਤੁਮ ਹੀ ਕਰਹੁ ਸੰਘਾਰ ॥ ੫੮ ॥ ਪੰਚਾਲ ਦੋਹਰਾ ॥ ਜਬਿ ਮਾਯਾ ਹਰਿ ਬਪੁ ਧਰ੍ਯੋ ਤਬਿ ਸਭ ਹੀ ਬਿਵਹਾਰ ॥ ਗੁਪਤਿ ਪ੍ਰਗਟਿ ਸਭ ਘਟਿ ਬਿਖੈ ਵਰਤੇ ਰੂਪ ਅਪਾਰ ॥ ੫੯ ॥",
  );

  it("finds where a larivaar manuscript snippet starts, despite spelling differences", () => {
    const r = locate("ਜਬਮਾਇਆਹਰਬਪੁਧਰਯੋਤਬਸਭਹੀਬਿਵਹਾਰ", padas);
    expect(r.index).toBe(4);
    expect(r.score).toBeGreaterThan(80);
  });

  it("finds a snippet that starts mid-line", () => {
    const r = locate("ਤੁਮਸਭਕੋਪੈਦਾਕਰੋ", padas);
    expect(r.index).toBe(2);
  });

  it("scores an unrelated snippet low", () => {
    expect(locate("ਸਰਬਲੋਹਰਛਿਆਕਰਨਸੰਤਨਕੇ", padas).score).toBeLessThan(60);
  });
});

describe("buildPageIndex", () => {
  const padas = splitPadas(
    "ਮਾਧੋ ਦੋਹਰਾ ॥ ਫੂਲ ਫਲ ਬਿਰਖਾ ਤੁਹੀਂ ਤੁਹੀਂ ਸਭਨ ਕੀ ਸਾਰ ॥ ਤੁਮ ਸਭ ਕੋ ਪੈਦਾ ਕਰੋ ਤੁਮ ਹੀ ਕਰਹੁ ਸੰਘਾਰ ॥ ੫੮ ॥ ਪੰਚਾਲ ਦੋਹਰਾ ॥ ਜਬਿ ਮਾਯਾ ਹਰਿ ਬਪੁ ਧਰ੍ਯੋ ਤਬਿ ਸਭ ਹੀ ਬਿਵਹਾਰ ॥ ਗੁਪਤਿ ਪ੍ਰਗਟਿ ਸਭ ਘਟਿ ਬਿਖੈ ਵਰਤੇ ਰੂਪ ਅਪਾਰ ॥ ੫੯ ॥ ਅਨੰਦ ਦੋਹਰਾ ॥ ਸਰਬਲੋਹ ਰਛ੍ਯਾ ਕਰਨ ਸੰਤਨ ਕੇ ਸੁਖ ਧਾਮ ॥ ਸ੍ਰੀ ਮਾਯਾ ਜਗ ਬੰਦਨੀ ਲਛਮੀ ਜਾ ਕੋ ਨਾਮ ॥ ੬੧ ॥",
  );

  it("locates each page opening and records the nearest closing verse number", () => {
    const idx = buildPageIndex(
      [
        { page: 10, opening: "ਫੂਲਫਲਬਿਰਖਾਤੁਹੀਤੁਹੀ" },
        { page: 11, opening: "ਜਬਮਾਇਆਹਰਬਪੁਧਰਯੋਤਬ" },
        { page: 12, opening: "ਸਰਬਲੋਹਰਛਿਆਕਰਨਸੰਤਨ" },
      ],
      padas,
    );
    expect(idx.map((e) => e.pada)).toEqual([1, 4, 7]);
    expect(idx.map((e) => e.nextRef)).toEqual(["58", "59", "61"]);
    expect(idx.every((e) => e.flag === null)).toBe(true);
  });

  it("flags a page whose opening lands out of order or scores low", () => {
    const idx = buildPageIndex(
      [
        { page: 10, opening: "ਜਬਮਾਇਆਹਰਬਪੁਧਰਯੋਤਬ" },
        { page: 11, opening: "ਫੂਲਫਲਬਿਰਖਾਤੁਹੀਤੁਹੀ" },
        { page: 12, opening: "ਕਖਗਘਙਚਛਜਝਞਟਠਡ" },
      ],
      padas,
    );
    expect(idx[1].flag).toBe("out-of-order");
    expect(idx[2].flag).toBe("low-score");
  });
});

describe("pagesFor", () => {
  const index = [
    { page: 66, opening: "", pada: 100, score: 90, nextRef: null, flag: null },
    { page: 69, opening: "", pada: 160, score: 90, nextRef: null, flag: null },
    { page: 74, opening: "", pada: 300, score: 90, nextRef: null, flag: null },
  ];

  it("returns the page whose span contains a half-line, plus its neighbour when near a boundary", () => {
    expect(pagesFor(120, index)).toEqual([66, 67, 68]);
    expect(pagesFor(160, index)).toEqual([68, 69]);
    expect(pagesFor(299, index)).toEqual([73, 74]);
  });

  it("ignores flagged entries and widens the window when index points are far apart", () => {
    const flagged = [index[0], { ...index[1], flag: "low-score" as const }, index[2]];
    // 66→74 is 8 pages for 200 half-lines: estimate p.69, ±2 pages.
    expect(pagesFor(170, flagged)).toEqual([67, 68, 69, 70, 71]);
  });

  it("extrapolates past the last index point at the previous density", () => {
    expect(pagesFor(328, index)).toEqual([74, 75, 76]);
  });
});
