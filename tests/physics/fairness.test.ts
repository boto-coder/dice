import { describe, it, expect } from 'vitest';
import { findDie } from '../../src/core/dice';
import { createCustomDie } from '../../src/core/customDice';
import { seededRng } from '../../src/core/random';
import { fairnessTable, outcomesOf, runFairness } from '../../src/physics/fairness';

const arena = { halfWidth: 6, halfDepth: 4 };
const combat = createCustomDie(
  { name: 'Combat', faces: ['⚔️', '⚔️', '🛡️', '🛡️', '💀', ''] },
  { id: 'custom-c' },
);

describe('outcomesOf', () => {
  it('gives each face its own outcome on a standard die', () => {
    const outcomes = outcomesOf(findDie('d4')!);
    expect(outcomes.map((o) => [o.label, o.probability])).toEqual([
      ['1', 0.25],
      ['2', 0.25],
      ['3', 0.25],
      ['4', 0.25],
    ]);
  });

  it('pools repeated faces, keeping the blank face', () => {
    expect(outcomesOf(combat).map((o) => [o.label, o.faceIndices])).toEqual([
      ['⚔️', [0, 1]],
      ['🛡️', [2, 3]],
      ['💀', [4]],
      ['', [5]],
    ]);
  });
});

describe('runFairness', () => {
  it('pools copies of a die and reports throw statistics', () => {
    const run = runFairness([findDie('d6')!, combat, findDie('d6')!], 20, seededRng(1), arena);
    expect(run.reports.map((r) => [r.dieName, r.rolls])).toEqual([
      ['d6', 40],
      ['Combat', 20],
    ]);
    const d6 = run.reports[0]!;
    expect(d6.outcomes.reduce((a, o) => a + o.observed, 0)).toBe(40);
    expect(d6.degreesOfFreedom).toBe(5);
    expect(d6.pValue).toBeGreaterThanOrEqual(0);
    expect(d6.pValue).toBeLessThanOrEqual(1);
    expect(run.throws.throws).toBe(20);
    expect(run.throws.meanSeconds).toBeGreaterThan(0);
    expect(run.throws.maxSeconds).toBeGreaterThanOrEqual(run.throws.meanSeconds);
  });

  it('can switch off the d100 label shuffle to measure raw face bias', () => {
    const run = runFairness([findDie('d100')!], 3, seededRng(4), arena, { shuffleLabels: false });
    expect(run.reports[0]!.rolls).toBe(3);
  });

  it('needs at least one throw', () => {
    expect(() => runFairness([findDie('d6')!], 0, seededRng(1), arena)).toThrow(RangeError);
    expect(() => runFairness([findDie('d6')!], 1.5, seededRng(1), arena)).toThrow(RangeError);
  });
});

describe('fairnessTable', () => {
  it('renders a markdown row per die', () => {
    const run = runFairness([findDie('d4')!], 40, seededRng(3), arena);
    const table = fairnessTable(run.reports);
    const lines = table.split('\n');
    expect(lines[0]).toBe('| Die | Rolls | Outcomes | Count range | χ² | df | p |');
    expect(lines).toHaveLength(3);
    expect(lines[2]).toMatch(/^\| d4 \| 40 \| 4 \| \d+–\d+ \| [\d.]+ \| 3 \| [\d.]+ \|$/);
  });
});
