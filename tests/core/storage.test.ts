import { describe, it, expect } from 'vitest';
import {
  STORAGE_KEY,
  STORAGE_VERSION,
  loadCustomDice,
  saveCustomDice,
} from '../../src/core/storage';
import { createCustomDie } from '../../src/core/customDice';
import { findDie } from '../../src/core/dice';

/** Minimal in-memory Storage stand-in. */
class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

const throwing = {
  getItem(): string | null {
    throw new Error('SecurityError');
  },
  setItem(): void {
    throw new Error('QuotaExceededError');
  },
};

const combat = createCustomDie(
  { name: 'Combat die', faces: ['⚔️', '⚔️', '🛡️', '🛡️', '💀', ''] },
  { id: 'custom-a' },
);
const low = createCustomDie(
  { name: 'Low', faces: ['1', '1', '2', '2', '3', '3'] },
  { id: 'custom-b' },
);

function withRaw(raw: string): MemoryStorage {
  const s = new MemoryStorage();
  s.setItem(STORAGE_KEY, raw);
  return s;
}

function withDice(dice: unknown[]): MemoryStorage {
  return withRaw(JSON.stringify({ version: STORAGE_VERSION, dice }));
}

describe('saveCustomDice / loadCustomDice', () => {
  it('round-trips custom dice', () => {
    const s = new MemoryStorage();
    expect(saveCustomDice(s, [combat, low])).toBe(true);
    expect(loadCustomDice(s)).toEqual({ dice: [combat, low], warnings: [] });
  });

  it('stores versioned JSON with face labels only', () => {
    const s = new MemoryStorage();
    saveCustomDice(s, [combat]);
    expect(JSON.parse(s.getItem(STORAGE_KEY)!)).toEqual({
      version: 1,
      dice: [{ id: 'custom-a', name: 'Combat die', faces: ['⚔️', '⚔️', '🛡️', '🛡️', '💀', ''] }],
    });
  });

  it('never saves standard dice', () => {
    const s = new MemoryStorage();
    saveCustomDice(s, [findDie('d6')!, combat]);
    expect(loadCustomDice(s).dice).toEqual([combat]);
  });

  it('saves an empty list', () => {
    const s = new MemoryStorage();
    saveCustomDice(s, [combat]);
    saveCustomDice(s, []);
    expect(loadCustomDice(s)).toEqual({ dice: [], warnings: [] });
  });
});

describe('loadCustomDice', () => {
  it('returns nothing when nothing is saved', () => {
    expect(loadCustomDice(new MemoryStorage())).toEqual({ dice: [], warnings: [] });
  });

  it('survives inaccessible storage', () => {
    const r = loadCustomDice(throwing);
    expect(r.dice).toEqual([]);
    expect(r.warnings[0]).toMatch(/not accessible/);
  });

  it('survives corrupt JSON', () => {
    const r = loadCustomDice(withRaw('{not json'));
    expect(r.dice).toEqual([]);
    expect(r.warnings[0]).toMatch(/corrupt/);
  });

  it.each([
    ['null', 'null'],
    ['an array', '[]'],
    ['a wrong version', JSON.stringify({ version: 99, dice: [] })],
    ['missing dice', JSON.stringify({ version: 1 })],
  ])('ignores %s', (_, raw) => {
    const r = loadCustomDice(withRaw(raw));
    expect(r.dice).toEqual([]);
    expect(r.warnings[0]).toMatch(/unknown format/);
  });

  it.each([
    ['not an object', 42],
    ['missing id', { name: 'X', faces: ['a', 'b', 'c', 'd'] }],
    ['empty id', { id: '', name: 'X', faces: ['a', 'b', 'c', 'd'] }],
    ['non-string name', { id: 'x', name: 3, faces: ['a', 'b', 'c', 'd'] }],
    ['non-array faces', { id: 'x', name: 'X', faces: 'abcd' }],
    ['non-string face', { id: 'x', name: 'X', faces: ['a', 2, 'c', 'd'] }],
  ])('skips a malformed entry (%s) but keeps valid ones', (_, bad) => {
    const r = loadCustomDice(
      withDice([bad, { id: 'ok', name: 'Ok', faces: ['1', '2', '3', '4'] }]),
    );
    expect(r.dice.map((d) => d.id)).toEqual(['ok']);
    expect(r.warnings).toEqual(['Saved die #1 is malformed and was skipped.']);
  });

  it('skips entries that fail validation', () => {
    const r = loadCustomDice(
      withDice([{ id: 'x', name: 'Five', faces: ['1', '2', '3', '4', '5'] }]),
    );
    expect(r.dice).toEqual([]);
    expect(r.warnings[0]).toMatch(/"Five" is invalid/);
  });

  it('skips duplicate ids', () => {
    const entry = { id: 'x', name: 'A', faces: ['1', '2', '3', '4'] };
    const r = loadCustomDice(withDice([entry, { ...entry, name: 'B' }]));
    expect(r.dice.map((d) => d.name)).toEqual(['A']);
    expect(r.warnings[0]).toMatch(/"B" is a duplicate/);
  });

  it('skips duplicate names', () => {
    const faces = ['1', '2', '3', '4'];
    const r = loadCustomDice(
      withDice([
        { id: 'x', name: 'Same', faces },
        { id: 'y', name: 'same', faces },
      ]),
    );
    expect(r.dice.map((d) => d.id)).toEqual(['x']);
    expect(r.warnings[0]).toMatch(/already exists/);
  });
});

describe('saveCustomDice', () => {
  it('returns false when storage throws (e.g. quota exceeded)', () => {
    expect(saveCustomDice(throwing, [combat])).toBe(false);
  });
});
