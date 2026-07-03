import { describe, it, expect } from 'vitest';
import {
  extractBigrams,
  extractCollocations,
  computePMI,
  filterCollocationsByPMI,
} from '../pipeline/compute/collocations';

describe('collocations', () => {
  describe('extractBigrams', () => {
    it('extracts ordered consecutive pairs from line positions', () => {
      // Line: word1, word2, word3 at positions 1, 2, 3
      const pairs = extractBigrams([
        { word_id: 10, position: 1 },
        { word_id: 20, position: 2 },
        { word_id: 30, position: 3 },
      ]);
      expect(pairs).toEqual([
        { w1_id: 10, w2_id: 20 },
        { w1_id: 20, w2_id: 30 },
      ]);
    });

    it('returns empty array for single word', () => {
      const pairs = extractBigrams([{ word_id: 10, position: 1 }]);
      expect(pairs).toEqual([]);
    });

    it('preserves order (first position < second position)', () => {
      // Positions may not be sequential; only consecutive by position order
      const pairs = extractBigrams([
        { word_id: 10, position: 5 },
        { word_id: 20, position: 10 },
        { word_id: 30, position: 15 },
      ]);
      expect(pairs).toEqual([
        { w1_id: 10, w2_id: 20 },
        { w1_id: 20, w2_id: 30 },
      ]);
    });
  });

  describe('extractCollocations', () => {
    it('extracts unordered pairs within window threshold', () => {
      // window_size = 3; positions 1, 2, 3 all within 3 of each other
      const pairs = extractCollocations(
        [
          { word_id: 10, position: 1 },
          { word_id: 20, position: 2 },
          { word_id: 30, position: 3 },
        ],
        3
      );
      // All pairs: (10,20), (10,30), (20,30)
      // Expect unordered (smaller id first)
      expect(pairs).toContainEqual({ word_a_id: 10, word_b_id: 20 });
      expect(pairs).toContainEqual({ word_a_id: 10, word_b_id: 30 });
      expect(pairs).toContainEqual({ word_a_id: 20, word_b_id: 30 });
      expect(pairs.length).toBe(3);
    });

    it('filters pairs outside window threshold', () => {
      // window_size = 2; positions 1 and 10 are 9 apart
      const pairs = extractCollocations(
        [
          { word_id: 10, position: 1 },
          { word_id: 20, position: 10 },
        ],
        2
      );
      expect(pairs).toEqual([]);
    });

    it('enforces word_a_id < word_b_id (canonical order)', () => {
      const pairs = extractCollocations(
        [
          { word_id: 20, position: 1 },
          { word_id: 10, position: 2 },
        ],
        3
      );
      // Should be (10,20), not (20,10)
      expect(pairs).toEqual([{ word_a_id: 10, word_b_id: 20 }]);
    });
  });

  describe('computePMI', () => {
    it('computes PMI = log2(pair_count * total / (count_a * count_b))', () => {
      // PMI = log2((3 * 100) / (10 * 20)) = log2(1.5) ≈ 0.585
      const pmi = computePMI({
        pair_count: 3,
        count_a: 10,
        count_b: 20,
        total: 100,
      });
      expect(pmi).toBeCloseTo(Math.log2(1.5), 2);
    });

    it('returns 0 for independent pairs (PMI=log2(1))', () => {
      // If pair_count matches independence, PMI = 0
      // pair_count = (count_a * count_b) / total → PMI = log2(1) = 0
      const pmi = computePMI({
        pair_count: 2,  // 10*20/100 = 2
        count_a: 10,
        count_b: 20,
        total: 100,
      });
      expect(pmi).toBeCloseTo(0, 2);
    });

    it('returns negative PMI for anti-correlated pairs', () => {
      // pair_count < expected → negative PMI
      const pmi = computePMI({
        pair_count: 1,  // less than 10*20/100 = 2
        count_a: 10,
        count_b: 20,
        total: 100,
      });
      expect(pmi).toBeLessThan(0);
    });
  });

  describe('filterCollocationsByPMI', () => {
    it('keeps top-50 collocations per word by PMI', () => {
      // Create 100 collocations for word 10 (all with word_a_id=10, varying word_b_id).
      // Each has sufficient pair_count and varying PMI.
      const collocations = Array.from({ length: 100 }, (_, i) => ({
        word_a_id: 10,
        word_b_id: 100 + i,
        pair_count: 100 - i,  // All >= 5
        pmi: 5 - i * 0.1,      // Decreasing PMI: 5, 4.9, 4.8, ...
      }));

      const filtered = filterCollocationsByPMI(collocations, 50);
      // Word 10 appears in all 100 input collocations, should keep top-50 by PMI
      expect(filtered.length).toBeLessThanOrEqual(50);
      // Highest PMI ones should be present
      expect(filtered.some((c) => c.pmi > 4.5)).toBe(true);
      // Lowest PMI ones should be filtered out (beyond top-50)
      expect(filtered.some((c) => c.pmi < 0)).toBe(false);
    });

    it('removes collocations with pair_count < threshold', () => {
      const collocations = [
        { word_a_id: 10, word_b_id: 20, pair_count: 2, pmi: 1 },  // below threshold 5
        { word_a_id: 10, word_b_id: 30, pair_count: 10, pmi: 2 }, // above threshold
      ];
      const filtered = filterCollocationsByPMI(collocations, 50, 5);
      expect(filtered).toEqual([{ word_a_id: 10, word_b_id: 30, pair_count: 10, pmi: 2 }]);
    });
  });
});
