import { describe, it, expect } from 'vitest';
import { seededRng } from '../../src/core/random';
import { runFairness } from '../../src/physics/fairness';
import { ALPHA, arenaFor, die } from './helpers';

describe('fairness of the d100 ball', () => {
  // 100 results per face on average.
  const run = runFairness([die('d100')], 10_000, seededRng(10_001), arenaFor(1));
  const report = run.reports[0]!;

  it(`passes a chi-square test over all 100 faces (p > ${ALPHA})`, () => {
    expect(report.degreesOfFreedom).toBe(99);
    expect(report.pValue, `χ²=${report.statistic.toFixed(2)}`).toBeGreaterThan(ALPHA);
  });

  it('shows every face', () => {
    expect(report.outcomes.every((o) => o.observed > 0)).toBe(true);
  });

  it('settles quickly and (almost) never times out', () => {
    expect(run.throws.meanSeconds).toBeLessThan(2.5);
    expect(run.throws.timeouts).toBeLessThanOrEqual(20);
  });
});
