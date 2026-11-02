import { describe, it, expect } from 'vitest';
import { seededRng } from '../../src/core/random';
import { runFairness } from '../../src/physics/fairness';
import { ALPHA, COMBAT, PIPS, STANDARD_DICE, arenaFor } from './helpers';

// A full tray: collisions between dice, nudges and timeouts must not bias results.
const TRAY = [...STANDARD_DICE, ...STANDARD_DICE, COMBAT, COMBAT, COMBAT, PIPS, PIPS, PIPS];

describe('fairness in a full tray of 20 mixed dice', () => {
  const run = runFairness(TRAY, 600, seededRng(2020), arenaFor(TRAY.length));

  it('has 20 dice', () => {
    expect(TRAY).toHaveLength(20);
  });

  it.each(run.reports.map((r) => [r.dieName, r] as const))(
    `%s passes a chi-square test (p > ${ALPHA})`,
    (_name, report) => {
      expect(report.pValue, `χ²=${report.statistic.toFixed(2)}`).toBeGreaterThan(ALPHA);
    },
  );

  it('settles within about 3 seconds on average, timing out in under 3% of throws', () => {
    const stats = JSON.stringify(run.throws);
    expect(run.throws.meanSeconds, stats).toBeLessThan(3);
    expect(run.throws.timeouts, stats).toBeLessThanOrEqual(600 * 0.03);
  });
});
