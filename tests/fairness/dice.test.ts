import { describe, it, expect } from 'vitest';
import { seededRng } from '../../src/core/random';
import { runFairness } from '../../src/physics/fairness';
import { ALPHA, COMBAT, PIPS, arenaFor, die } from './helpers';

// Each die is thrown alone thousands of times in the headless physics world,
// with a fixed seed so the outcome is reproducible.
const cases = [
  { die: die('d4'), throws: 4000, seed: 401 },
  { die: die('d6'), throws: 6000, seed: 601 },
  { die: die('d8'), throws: 6000, seed: 801 },
  { die: die('d10'), throws: 6000, seed: 1001 },
  { die: die('d12'), throws: 6000, seed: 1201 },
  { die: die('d20'), throws: 8000, seed: 2001 },
  { die: COMBAT, throws: 6000, seed: 6006 },
  { die: PIPS, throws: 4000, seed: 4004 },
];

describe.each(cases)('fairness of $die.name', ({ die, throws, seed }) => {
  const run = runFairness([die], throws, seededRng(seed), arenaFor(1));
  const report = run.reports[0]!;

  it(`passes a chi-square test (p > ${ALPHA})`, () => {
    expect(report.rolls).toBe(throws);
    expect(report.pValue, `χ²=${report.statistic.toFixed(2)}`).toBeGreaterThan(ALPHA);
  });

  it('shows every outcome', () => {
    for (const o of report.outcomes) expect(o.observed, o.label).toBeGreaterThan(0);
  });

  it('settles quickly and (almost) never times out', () => {
    expect(run.throws.meanSeconds).toBeLessThan(2.5);
    expect(run.throws.timeouts).toBeLessThanOrEqual(throws * 0.002);
  });
});
