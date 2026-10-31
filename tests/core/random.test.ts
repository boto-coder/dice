import { describe, it, expect } from 'vitest';
import { secureRandom, randomInt, randomBetween, randomId } from '../../src/core/random';

describe('secureRandom', () => {
  it('returns floats in [0, 1)', () => {
    for (let i = 0; i < 10_000; i++) {
      const x = secureRandom();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('is roughly uniform across 10 buckets', () => {
    const buckets = new Array<number>(10).fill(0);
    const n = 50_000;
    for (let i = 0; i < n; i++) buckets[Math.floor(secureRandom() * 10)]!++;
    for (const count of buckets) {
      expect(count).toBeGreaterThan(n / 10 - 600);
      expect(count).toBeLessThan(n / 10 + 600);
    }
  });
});

describe('randomInt', () => {
  it('covers the whole inclusive range and nothing else', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2_000; i++) seen.add(randomInt(1, 6));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('maps the rng extremes to min and max', () => {
    expect(randomInt(3, 7, () => 0)).toBe(3);
    expect(randomInt(3, 7, () => 0.999999)).toBe(7);
  });

  it('allows a single-value range', () => {
    expect(randomInt(5, 5)).toBe(5);
  });

  it.each([
    [2, 1],
    [1.5, 3],
    [1, Number.NaN],
  ])('rejects invalid range [%s, %s]', (min, max) => {
    expect(() => randomInt(min, max)).toThrow(RangeError);
  });
});

describe('randomBetween', () => {
  it('scales the rng output into the range', () => {
    expect(randomBetween(-2, 2, () => 0)).toBe(-2);
    expect(randomBetween(-2, 2, () => 0.5)).toBe(0);
  });

  it('uses the secure rng by default', () => {
    const x = randomBetween(10, 20);
    expect(x).toBeGreaterThanOrEqual(10);
    expect(x).toBeLessThan(20);
  });
});

describe('randomId', () => {
  it('returns 16 lowercase hex chars', () => {
    expect(randomId()).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is unique across many calls', () => {
    const ids = new Set(Array.from({ length: 1_000 }, randomId));
    expect(ids.size).toBe(1_000);
  });
});
