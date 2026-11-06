import { describe, it, expect } from "vitest";
import { parseMkPointer } from "../lib/padarth/mk-pointer";

// Texts are real Mahan Kosh definition rows (definitions.definition_text, source mahan_kosh).

describe("parseMkPointer", () => {
  it("reads a bare pointer, with or without the trailing stop", () => {
    expect(parseMkPointer("ਦੇਖੋ, ਸੰਗ੍ਰਹ")).toEqual([{ target: "ਸੰਗ੍ਰਹ", sense: null }]);
    expect(parseMkPointer("ਦੇਖੋ, ਮੰਞ.")).toEqual([{ target: "ਮੰਞ", sense: null }]);
    expect(parseMkPointer("ਦੇਖੋ. ਪਛਤਾਪ.")).toEqual([{ target: "ਪਛਤਾਪ", sense: null }]);
    expect(parseMkPointer("ਦੇਖੋ ਜੰਬੁ")).toEqual([{ target: "ਜੰਬੁ", sense: null }]);
  });

  it("reads a sense number after the target", () => {
    expect(parseMkPointer("ਦੇਖੋ, ਕਰਣ ੧੧.")).toEqual([{ target: "ਕਰਣ", sense: 11 }]);
    expect(parseMkPointer("ਦੇਖੋ, ਭਾਵਾ ੨")).toEqual([{ target: "ਭਾਵਾ", sense: 2 }]);
  });

  it("keeps a multi-word target whole", () => {
    expect(parseMkPointer("ਦੇਖੋ, ਗੁਲ ਲਾਲਾ.")).toEqual([{ target: "ਗੁਲ ਲਾਲਾ", sense: null }]);
  });

  it("splits several targets on commas and ਅਤੇ", () => {
    expect(parseMkPointer("ਦੇਖੋ, ਉਜਾਰਾ, ਉਜਾੜ ਅਤੇ ਔਜਾਰ.")).toEqual([
      { target: "ਉਜਾਰਾ", sense: null },
      { target: "ਉਜਾੜ", sense: null },
      { target: "ਔਜਾਰ", sense: null },
    ]);
  });

  it("is still a pointer when only quoted citations follow", () => {
    expect(parseMkPointer('ਦੇਖੋ, ਪੂਰਬਲਾ. "ਪੂਰਬਲੋ ਕ੍ਰਿਤ ਕਰਮ ਨ ਮਿਟੈ." (ਧਨਾ ਤ੍ਰਿਲੋਚਨ)')).toEqual([{ target: "ਪੂਰਬਲਾ", sense: null }]);
    expect(parseMkPointer('ਦੇਖੋ, ਪ੍ਰਸਾਦ ੧. "ਗੁਰੁ ਪਰਸਾਦੁ ਕਰੇ ਨਾਮੁ ਦੇਵੈ." (ਮਾਝ ਅਃ ਮਃ ੪) "ਗੁਰੁ ਪੂਰਾ ਪੂਰਾ ਪਰਸਾਦ." (ਭੈਰ ਮਃ ੫)')).toEqual([
      { target: "ਪ੍ਰਸਾਦ", sense: 1 },
    ]);
    expect(parseMkPointer('ਦੇਖੋ, ਲੋਹ. "ਲੋਹਾ ਪਾਰਸਿ ਭੇਟੀਐ." (ਮਃ ੪. ਵਾਰ ਸਾਰ)')).toEqual([{ target: "ਲੋਹ", sense: null }]);
  });

  it("is not a pointer when Mahan Kosh adds his own words after the citations", () => {
    expect(parseMkPointer('ਦੇਖੋ, ਦੁਲਹ. "ਦੂਲਹ ਪ੍ਰਭੁ ਕੀ ਸਰਨਿ ਪਰਿਓ." (ਮਾਰੂ ਨਾਮਦੇਵ) ਦੂਲਹ ਤੋਂ ਭਾਵ ਜੀਵ ਅਥਵਾ ਜਿਗ੍ਯਾਸੂ ਹੈ.')).toBeNull();
    expect(parseMkPointer('ਦੇਖੋ, ਸੱਖਣਾ. "ਕਹੂੰ ਸਸਤ੍ਰ ਸੱਖੰ." (ਵਿਚਿਤ੍ਰ) ਸਸਤ੍ਰਾਂ ਤੋਂ ਸੱਖਣੇ.')).toBeNull();
  });

  it("is not a pointer when the gloss only ends with one", () => {
    expect(parseMkPointer("ਹ੍ਰਿਦਯ ਮੰਦਿਰ ਵਿੱਚ. ਦੇਖੋ ਹਿਆਲਾ.")).toBeNull();
    expect(parseMkPointer("ਨੌਕਾ ਦਾ ਤਿਕੋਣਾ ਤਖ਼ਤਾ, ਜੋ ਪਿਛਲੇ ਪਾਸੇ ਹੁੰਦਾ ਹੈ। ਦੇਖੋ. ਪਤਵਾਰ.")).toBeNull();
    expect(parseMkPointer("ਸ਼ਰੀਰ. ਦੇਹ")).toBeNull();
  });
});
