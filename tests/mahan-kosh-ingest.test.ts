import { describe, it, expect } from "vitest";
import { duplicateSenseKeys } from "../pipeline/mahan-kosh/sense-keys";

// #159: ingest used to keep the last of two rows sharing (word_id,
// sense_number) and log "N duplicate senses collapsed", dropping senses
// without a trace. normalize.py now repairs the numbering, and ingest must
// refuse to run if any duplicate key remains.
describe("duplicateSenseKeys", () => {
  it("returns nothing for unique keys", () => {
    expect(
      duplicateSenseKeys([
        { word_id: 1, sense_number: 1, entry_gurmukhi: "ਕੋਲੀ" },
        { word_id: 1, sense_number: 2, entry_gurmukhi: "ਕੋਲੀ" },
        { word_id: 2, sense_number: 1, entry_gurmukhi: "ਥੋਰੀ" },
      ])
    ).toEqual([]);
  });

  it("names each repeated (word, sense) once, with how many rows share it", () => {
    expect(
      duplicateSenseKeys([
        { word_id: 1, sense_number: 2, entry_gurmukhi: "ਕੋਲੀ" },
        { word_id: 1, sense_number: 2, entry_gurmukhi: "ਕੋਲੀ" },
        { word_id: 1, sense_number: 2, entry_gurmukhi: "ਕੋਲੀ" },
        { word_id: 3, sense_number: 4, entry_gurmukhi: null },
        { word_id: 3, sense_number: 4, entry_gurmukhi: null },
      ])
    ).toEqual(["ਕੋਲੀ (word 1) sense 2 ×3", "word 3 sense 4 ×2"]);
  });
});
