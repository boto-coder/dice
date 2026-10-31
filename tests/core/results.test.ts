import { describe, it, expect } from 'vitest';
import { buildRollResult, critFor, describeRoll, dieResult } from '../../src/core/results';
import { findDie, type DieDefinition } from '../../src/core/dice';
import { createCustomDie } from '../../src/core/customDice';

const d = (id: string) => findDie(id)!;
const combat = createCustomDie({ name: 'Combat', faces: ['⚔️', '⚔️', '🛡️', '🛡️', '💀', ''] });
const lowD6 = createCustomDie({ name: 'Low', faces: ['1', '1', '2', '2', '3', '3'] });
const custom20 = createCustomDie({
  name: 'Fake d20',
  faces: Array.from({ length: 20 }, (_, i) => String(i + 1)),
});

describe('critFor', () => {
  it('flags natural 20 and natural 1 on the standard d20', () => {
    expect(critFor(d('d20'), { label: '20', value: 20 })).toBe('success');
    expect(critFor(d('d20'), { label: '1', value: 1 })).toBe('failure');
    expect(critFor(d('d20'), { label: '10', value: 10 })).toBeNull();
  });

  it.each(['d4', 'd6', 'd8', 'd10', 'd12', 'd100'])('never flags %s', (id) => {
    expect(critFor(d(id), { label: '1', value: 1 })).toBeNull();
    expect(critFor(d(id), { label: '20', value: 20 })).toBeNull();
  });

  it('never flags a custom d20', () => {
    expect(critFor(custom20, { label: '20', value: 20 })).toBeNull();
  });
});

describe('dieResult', () => {
  it('captures the rolled face', () => {
    expect(dieResult({ die: d('d6'), faceIndex: 3 })).toEqual({
      dieId: 'd6',
      name: 'd6',
      shape: 'd6',
      faceIndex: 3,
      face: { label: '4', value: 4 },
      counted: true,
      crit: null,
    });
  });

  it('marks symbol dice as not counted', () => {
    expect(dieResult({ die: combat, faceIndex: 0 }).counted).toBe(false);
  });

  it.each([-1, 6, 1.5, Number.NaN])('rejects face index %s', (i) => {
    expect(() => dieResult({ die: d('d6'), faceIndex: i })).toThrow(RangeError);
  });
});

describe('buildRollResult', () => {
  it('sums a group of the same die', () => {
    const r = buildRollResult([
      { die: d('d6'), faceIndex: 1 },
      { die: d('d6'), faceIndex: 4 },
    ]);
    expect(r.total).toBe(7);
    expect(r.dice).toHaveLength(2);
  });

  it('sums a mixed group', () => {
    const r = buildRollResult([
      { die: d('d6'), faceIndex: 5 },
      { die: d('d10'), faceIndex: 9 },
      { die: d('d100'), faceIndex: 99 },
    ]);
    expect(r.total).toBe(6 + 10 + 100);
  });

  it('includes custom number dice in the sum', () => {
    const r = buildRollResult([
      { die: lowD6, faceIndex: 5 },
      { die: d('d4'), faceIndex: 0 },
    ]);
    expect(r.total).toBe(4);
  });

  it('excludes symbol dice from the sum', () => {
    const r = buildRollResult([
      { die: combat, faceIndex: 0 },
      { die: d('d8'), faceIndex: 7 },
    ]);
    expect(r.total).toBe(8);
  });

  it('has no total when only symbol dice are rolled', () => {
    const r = buildRollResult([
      { die: combat, faceIndex: 0 },
      { die: combat, faceIndex: 4 },
    ]);
    expect(r.total).toBeNull();
  });

  it('handles an empty roll', () => {
    expect(buildRollResult([])).toEqual({ dice: [], total: null });
  });

  it('keeps dice in roll order', () => {
    const dice: DieDefinition[] = [d('d20'), combat, d('d4')];
    const r = buildRollResult(dice.map((die) => ({ die, faceIndex: 0 })));
    expect(r.dice.map((x) => x.dieId)).toEqual([d('d20').id, combat.id, 'd4']);
  });
});

describe('describeRoll', () => {
  it('describes number dice with a total', () => {
    const r = buildRollResult([
      { die: d('d6'), faceIndex: 2 },
      { die: d('d10'), faceIndex: 6 },
    ]);
    expect(describeRoll(r)).toBe('d6: 3, d10: 7. Total: 10.');
  });

  it('mentions crits', () => {
    const r = buildRollResult([{ die: d('d20'), faceIndex: 19 }]);
    expect(describeRoll(r)).toBe('d20: 20 (critical success). Total: 20.');
    const f = buildRollResult([{ die: d('d20'), faceIndex: 0 }]);
    expect(describeRoll(f)).toBe('d20: 1 (critical failure). Total: 1.');
  });

  it('describes symbol and blank faces without a total', () => {
    const r = buildRollResult([
      { die: combat, faceIndex: 4 },
      { die: combat, faceIndex: 5 },
    ]);
    expect(describeRoll(r)).toBe('Combat: 💀, Combat: blank.');
  });

  it('describes an empty roll', () => {
    expect(describeRoll(buildRollResult([]))).toBe('No dice rolled.');
  });
});
