// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { STANDARD_DICE, findDie, type DieDefinition } from '../../src/core/dice';
import { createHistoryEntry } from '../../src/core/history';
import { buildRollResult } from '../../src/core/results';
import { el, renderHistory, renderResults, renderTray } from '../../src/ui/views';

const symbolDie: DieDefinition = {
  id: 'custom-1',
  name: 'Combat',
  shape: 'd6',
  custom: true,
  faces: ['⚔️', '⚔️', '🛡️', '🛡️', '💀', ''].map((label) => ({ label, value: null })),
};

describe('el', () => {
  it('creates an element with class and text', () => {
    const p = el('p', 'x', 'hi');
    expect(p.tagName).toBe('P');
    expect(p).toHaveClass('x');
    expect(p).toHaveTextContent('hi');
    expect(el('div').className).toBe('');
  });
});

describe('renderResults', () => {
  it('shows a hint before the first roll', () => {
    const box = el('div');
    renderResults(box, null);
    expect(box).toHaveTextContent('Add dice to the tray and press Roll.');
  });

  it('shows symbol faces without a total and a dash for blank faces', () => {
    const box = el('div');
    renderResults(
      box,
      buildRollResult([
        { die: symbolDie, faceIndex: 4 },
        { die: symbolDie, faceIndex: 5 },
      ]),
    );
    const values = [...box.querySelectorAll('.die-result__value')].map((v) => v.textContent);
    expect(values).toEqual(['💀', '–']);
    expect(box.querySelector('.results__total')).toBeNull();
  });

  it('sums only the number dice in a mixed roll', () => {
    const box = el('div');
    renderResults(
      box,
      buildRollResult([
        { die: symbolDie, faceIndex: 0 },
        { die: STANDARD_DICE[1]!, faceIndex: 3 },
      ]),
    );
    expect(box.querySelector('.results__total-value')).toHaveTextContent('4');
  });
});

describe('renderTray', () => {
  it('skips dice that no longer exist', () => {
    const list = el('ul');
    renderTray(
      list,
      [
        { uid: 'a', dieId: 'd6' },
        { uid: 'b', dieId: 'gone' },
      ],
      (id) => findDie(id),
    );
    const buttons = list.querySelectorAll('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAttribute('data-uid', 'a');
    expect(buttons[0]).toHaveAccessibleName('Remove d6 from tray');
  });
});

describe('renderHistory', () => {
  it('omits the total for symbol-only rolls', () => {
    const list = el('ol');
    const result = buildRollResult([{ die: symbolDie, faceIndex: 2 }]);
    renderHistory(list, [createHistoryEntry(result, '1 × Combat', 0, 'id')]);
    expect(list).toHaveTextContent('1 × Combat');
    expect(list).toHaveTextContent('Combat 🛡️');
    expect(list.querySelector('.history__total')).toBeNull();
  });

  it('marks a natural 1 on the d20', () => {
    const list = el('ol');
    const result = buildRollResult([{ die: findDie('d20')!, faceIndex: 0 }]);
    renderHistory(list, [createHistoryEntry(result, '1 × d20', 0, 'id')]);
    const value = list.querySelector('.history__value--failure');
    expect(value).toHaveTextContent('d20 1');
    expect(value).toHaveAttribute('title', 'Nat 1');
  });
});
