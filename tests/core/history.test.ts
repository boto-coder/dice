import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  EMPTY_HISTORY,
  MAX_HISTORY,
  addHistoryEntry,
  clearHistory,
  createHistoryEntry,
  type History,
} from '../../src/core/history';
import type { RollResult } from '../../src/core/results';

const result: RollResult = { dice: [], total: 7 };

afterEach(() => {
  vi.useRealTimers();
});

describe('createHistoryEntry', () => {
  it('stamps the current time and a random id by default', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));
    const e = createHistoryEntry(result, '2 × d6');
    expect(e.timestamp).toBe(Date.parse('2026-10-31T12:00:00Z'));
    expect(e.id).toMatch(/^[0-9a-f]{16}$/);
    expect(e.label).toBe('2 × d6');
    expect(e.result).toBe(result);
  });

  it('accepts an explicit timestamp and id', () => {
    expect(createHistoryEntry(result, 'x', 5, 'id1')).toEqual({
      id: 'id1',
      timestamp: 5,
      label: 'x',
      result,
    });
  });
});

describe('addHistoryEntry', () => {
  it('puts the newest entry first', () => {
    let h: History = EMPTY_HISTORY;
    h = addHistoryEntry(h, createHistoryEntry(result, 'first', 1, 'a'));
    h = addHistoryEntry(h, createHistoryEntry(result, 'second', 2, 'b'));
    expect(h.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it(`keeps at most ${MAX_HISTORY} entries, dropping the oldest`, () => {
    let h: History = EMPTY_HISTORY;
    for (let i = 0; i < MAX_HISTORY + 5; i++) {
      h = addHistoryEntry(h, createHistoryEntry(result, `r${i}`, i, `id${i}`));
    }
    expect(h).toHaveLength(MAX_HISTORY);
    expect(h[0]!.id).toBe(`id${MAX_HISTORY + 4}`);
    expect(h.at(-1)!.id).toBe('id5');
  });

  it('does not mutate the original history', () => {
    const h = addHistoryEntry(EMPTY_HISTORY, createHistoryEntry(result, 'a', 1, 'a'));
    addHistoryEntry(h, createHistoryEntry(result, 'b', 2, 'b'));
    expect(h).toHaveLength(1);
  });
});

describe('clearHistory', () => {
  it('returns an empty history', () => {
    expect(clearHistory()).toEqual([]);
  });
});
