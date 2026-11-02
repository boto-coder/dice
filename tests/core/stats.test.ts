import { describe, it, expect } from 'vitest';
import { chiSquare, chiSquarePValue, gammaQ, goodnessOfFit, lnGamma } from '../../src/core/stats';

describe('chiSquare', () => {
  it('sums (o − e)² / e', () => {
    expect(chiSquare([10, 20, 30], [20, 20, 20])).toBeCloseTo(10);
    expect(chiSquare([5, 5], [5, 5])).toBe(0);
  });

  it('rejects mismatched lengths and non-positive expectations', () => {
    expect(() => chiSquare([1], [1, 2])).toThrow(RangeError);
    expect(() => chiSquare([1, 2], [1, 0])).toThrow(/positive/);
  });
});

describe('lnGamma', () => {
  it.each([
    [1, 0],
    [2, 0],
    [5, Math.log(24)],
    [0.5, Math.log(Math.sqrt(Math.PI))],
    [10.5, Math.log(1133278.388948786)],
    [0.1, Math.log(9.513507698668732)],
  ])('lnΓ(%f) = %f', (x, expected) => {
    expect(lnGamma(x)).toBeCloseTo(expected, 10);
  });
});

describe('gammaQ', () => {
  it('matches e^−x for a = 1', () => {
    for (const x of [0.1, 1, 2.5, 10]) expect(gammaQ(1, x)).toBeCloseTo(Math.exp(-x), 12);
  });

  it('is 1 at x = 0 and rejects bad arguments', () => {
    expect(gammaQ(3, 0)).toBe(1);
    expect(() => gammaQ(0, 1)).toThrow(RangeError);
    expect(() => gammaQ(1, -1)).toThrow(RangeError);
  });
});

describe('chiSquarePValue', () => {
  // Critical values from standard chi-square tables.
  it.each([
    [3.841, 1, 0.05],
    [6.635, 1, 0.01],
    [11.07, 5, 0.05],
    [15.086, 5, 0.01],
    [21.666, 9, 0.01],
    [36.191, 19, 0.01],
    [123.225, 99, 0.05],
    [134.642, 99, 0.01],
  ])('χ² = %f with %i df has p ≈ %f', (x, df, p) => {
    expect(chiSquarePValue(x, df)).toBeCloseTo(p, 3);
  });

  it('is 1 for a perfect fit and tiny for a terrible one', () => {
    expect(chiSquarePValue(0, 5)).toBe(1);
    expect(chiSquarePValue(500, 5)).toBeLessThan(1e-50);
  });
});

describe('goodnessOfFit', () => {
  it('accepts counts close to the expected proportions', () => {
    const r = goodnessOfFit([1010, 990, 1005, 995, 1003, 997], Array(6).fill(1 / 6));
    expect(r.degreesOfFreedom).toBe(5);
    expect(r.pValue).toBeGreaterThan(0.99);
  });

  it('detects a loaded die', () => {
    // Six comes up 22% instead of 16.7% over 6000 rolls.
    const r = goodnessOfFit([960, 960, 960, 960, 840, 1320], Array(6).fill(1 / 6));
    expect(r.pValue).toBeLessThan(1e-6);
  });

  it('handles unequal probabilities (a custom die with repeated faces)', () => {
    // ⚔️ ×2, 🛡️ ×2, 💀, blank over 600 rolls.
    const fair = goodnessOfFit([200, 198, 102, 100], [2 / 6, 2 / 6, 1 / 6, 1 / 6]);
    expect(fair.pValue).toBeGreaterThan(0.5);
    const treatedAsUniform = goodnessOfFit([200, 198, 102, 100], Array(4).fill(1 / 4));
    expect(treatedAsUniform.pValue).toBeLessThan(1e-6);
  });
});
