import { describe, it, expect } from 'vitest';
import {
  EMPTY_TRAY,
  MAX_TRAY_DICE,
  addToTray,
  describeTray,
  isTrayFull,
  pruneTray,
  removeFromTray,
  type Tray,
} from '../../src/core/tray';
import { findDie, type DieDefinition } from '../../src/core/dice';

const combat: DieDefinition = {
  id: 'custom-c',
  name: 'Combat die',
  shape: 'd6',
  faces: [],
  custom: true,
};
const lookup = (id: string) => findDie(id, [combat]);

function fill(n: number): Tray {
  let tray = EMPTY_TRAY;
  for (let i = 0; i < n; i++) tray = addToTray(tray, 'd6', `u${i}`);
  return tray;
}

describe('addToTray', () => {
  it('appends a die with a generated uid', () => {
    const tray = addToTray(EMPTY_TRAY, 'd20');
    expect(tray).toHaveLength(1);
    expect(tray[0]!.dieId).toBe('d20');
    expect(tray[0]!.uid).toMatch(/^[0-9a-f]{16}$/);
  });

  it('allows several copies of the same die with distinct uids', () => {
    const tray = addToTray(addToTray(EMPTY_TRAY, 'd6'), 'd6');
    expect(tray.map((d) => d.dieId)).toEqual(['d6', 'd6']);
    expect(tray[0]!.uid).not.toBe(tray[1]!.uid);
  });

  it('does not mutate the original tray', () => {
    const before = addToTray(EMPTY_TRAY, 'd6', 'a');
    addToTray(before, 'd8', 'b');
    expect(before).toEqual([{ uid: 'a', dieId: 'd6' }]);
  });

  it(`stops at ${MAX_TRAY_DICE} dice`, () => {
    const full = fill(MAX_TRAY_DICE);
    expect(isTrayFull(full)).toBe(true);
    expect(addToTray(full, 'd20')).toBe(full);
  });

  it('is not full below the limit', () => {
    expect(isTrayFull(fill(MAX_TRAY_DICE - 1))).toBe(false);
    expect(isTrayFull(EMPTY_TRAY)).toBe(false);
  });
});

describe('removeFromTray', () => {
  it('removes only the die with the given uid', () => {
    const tray = fill(3);
    expect(removeFromTray(tray, 'u1').map((d) => d.uid)).toEqual(['u0', 'u2']);
  });

  it('ignores unknown uids', () => {
    const tray = fill(2);
    expect(removeFromTray(tray, 'zzz')).toEqual(tray);
  });
});

describe('pruneTray', () => {
  it('drops dice that no longer exist', () => {
    const tray = addToTray(addToTray(EMPTY_TRAY, 'd6', 'a'), 'custom-gone', 'b');
    expect(pruneTray(tray, (id) => lookup(id) !== undefined)).toEqual([{ uid: 'a', dieId: 'd6' }]);
  });

  it('returns the same tray when nothing is removed', () => {
    const tray = fill(2);
    expect(pruneTray(tray, () => true)).toBe(tray);
  });
});

describe('describeTray', () => {
  it('groups dice by type in first-seen order', () => {
    let tray = EMPTY_TRAY;
    for (const id of ['d6', 'custom-c', 'd6', 'd10']) tray = addToTray(tray, id);
    expect(describeTray(tray, lookup)).toBe('2 × d6 + 1 × Combat die + 1 × d10');
  });

  it('is empty for an empty tray', () => {
    expect(describeTray(EMPTY_TRAY, lookup)).toBe('');
  });

  it('skips unknown dice', () => {
    const tray = addToTray(addToTray(EMPTY_TRAY, 'gone'), 'd4');
    expect(describeTray(tray, lookup)).toBe('1 × d4');
  });
});
