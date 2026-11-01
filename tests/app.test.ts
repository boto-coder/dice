// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getByRole, queryAllByRole, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { mountApp } from '../src/app';
import { MAX_HISTORY } from '../src/core/history';
import { MAX_TRAY_DICE } from '../src/core/tray';
import type { DiceTable } from '../src/render/table';

/** A table whose rolls resolve when the test says so. */
function fakeTable() {
  let resolveRoll: ((faces: number[]) => void) | null = null;
  let rejectRoll: ((e: Error) => void) | null = null;
  const table = {
    roll: vi.fn<DiceTable['roll']>(
      () =>
        new Promise<number[]>((res, rej) => {
          resolveRoll = res;
          rejectRoll = rej;
        }),
    ),
    highlight: vi.fn(),
    dispose: vi.fn(),
  } satisfies DiceTable;
  return {
    table,
    finish: async (faces: number[]) => {
      resolveRoll!(faces);
      await vi.waitFor(() => expect(status().textContent).not.toBe('Rolling…'));
    },
    fail: async () => {
      rejectRoll!(new Error('boom'));
      await vi.waitFor(() => expect(status().textContent).not.toBe('Rolling…'));
    },
  };
}

let root: HTMLElement;
const status = () => getByRole(root, 'status');
const button = (name: string | RegExp) => getByRole(root, 'button', { name });
const tray = () => getByRole(root, 'region', { name: 'Tray' });
const trayChips = () => queryAllByRole(tray(), 'button', { name: /^Remove / });
const results = () => getByRole(root, 'region', { name: 'Results' });
const historyEntries = () => [...root.querySelectorAll('.history__entry')];

function mount() {
  const fake = fakeTable();
  const app = mountApp(root, { createTable: () => fake.table });
  return { ...fake, app, user: userEvent.setup() };
}

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById('app')!;
});

describe('layout', () => {
  it('renders the title, table, results, dice bar, tray, roll buttons and history', () => {
    mount();
    const main = getByRole(root, 'main');
    expect(getByRole(main, 'heading', { level: 1, name: 'Dice Roller' })).toBeInTheDocument();
    expect(getByRole(main, 'region', { name: 'Dice table' })).toBeInTheDocument();
    expect(results()).toHaveTextContent('Add dice to the tray and press Roll.');
    const bar = getByRole(main, 'group', { name: 'Add dice' });
    for (const id of ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']) {
      const b = getByRole(bar, 'button', { name: `Add ${id} to tray` });
      expect(b).toHaveTextContent(id);
      expect(b).not.toHaveAttribute('aria-disabled');
    }
    expect(tray()).toHaveTextContent(`0 / ${MAX_TRAY_DICE}`);
    expect(button('Roll')).toHaveAttribute('aria-disabled', 'true');
    expect(button('Roll again')).toHaveAttribute('aria-disabled', 'true');
    expect(root.querySelector('details.history')).toHaveTextContent('No rolls yet.');
    expect(status()).toHaveAttribute('aria-live', 'polite');
  });

  it('creates the table inside the table region', () => {
    const { table } = fakeTable();
    const createTable = vi.fn(() => table);
    mountApp(root, { createTable });
    expect(createTable).toHaveBeenCalledWith(getByRole(root, 'region', { name: 'Dice table' }));
  });

  it('opens history by default on wide screens', () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn(() => ({ matches: true }) as MediaQueryList);
    mount();
    expect(root.querySelector('details.history')).toHaveAttribute('open');
    window.matchMedia = original;
  });

  it('keeps history closed by default on narrow screens', () => {
    mount();
    expect(root.querySelector('details.history')).not.toHaveAttribute('open');
  });
});

describe('tray', () => {
  it('adds dice by tapping their buttons, including several of the same die', async () => {
    const { user } = mount();
    await user.click(button('Add d6 to tray'));
    await user.click(button('Add d6 to tray'));
    await user.click(button('Add d10 to tray'));
    expect(trayChips().map((c) => c.textContent)).toEqual(['d6', 'd6', 'd10']);
    expect(tray()).toHaveTextContent('3 / 20: 2 × d6 + 1 × d10');
    expect(button('Roll')).not.toHaveAttribute('aria-disabled');
  });

  it('removes a die when its chip is tapped and keeps focus in the tray', async () => {
    const { user } = mount();
    await user.click(button('Add d4 to tray'));
    await user.click(button('Add d8 to tray'));
    await user.click(button('Add d12 to tray'));
    await user.click(trayChips()[1]!);
    expect(trayChips().map((c) => c.textContent)).toEqual(['d4', 'd12']);
    expect(document.activeElement).toBe(trayChips()[1]);

    await user.click(trayChips()[1]!);
    expect(document.activeElement).toBe(trayChips()[0]);
    await user.click(trayChips()[0]!);
    expect(trayChips()).toHaveLength(0);
    expect(document.activeElement).toBe(button('Add d4 to tray'));
    expect(button('Roll')).toHaveAttribute('aria-disabled', 'true');
  });

  it(`stops at ${MAX_TRAY_DICE} dice`, async () => {
    const { user } = mount();
    const add = button('Add d20 to tray');
    for (let i = 0; i < MAX_TRAY_DICE + 2; i++) await user.click(add);
    expect(trayChips()).toHaveLength(MAX_TRAY_DICE);
    expect(add).toHaveAttribute('aria-disabled', 'true');
    expect(tray()).toHaveTextContent(`The tray is full (${MAX_TRAY_DICE} dice).`);

    await user.click(trayChips()[0]!);
    expect(add).not.toHaveAttribute('aria-disabled');
  });

  it('empties with Clear tray', async () => {
    const { user } = mount();
    expect(button('Clear tray')).toHaveAttribute('aria-disabled', 'true');
    await user.click(button('Add d6 to tray'));
    await user.click(button('Clear tray'));
    expect(trayChips()).toHaveLength(0);
    expect(button('Clear tray')).toHaveAttribute('aria-disabled', 'true');
  });

  it('does nothing when an unavailable Clear tray is pressed', async () => {
    const { user } = mount();
    await user.click(button('Clear tray'));
    expect(trayChips()).toHaveLength(0);
  });
});

describe('rolling', () => {
  it('rolls the tray, shows each die and the total, and announces the result', async () => {
    const { user, table, finish } = mount();
    await user.click(button('Add d6 to tray'));
    await user.click(button('Add d6 to tray'));
    await user.click(button('Add d10 to tray'));
    await user.click(button('Roll'));

    expect(table.roll).toHaveBeenCalledWith(
      ['d6', 'd6', 'd10'].map((id) => expect.objectContaining({ id })),
    );
    expect(status()).toHaveTextContent('Rolling…');
    expect(results()).toHaveAttribute('aria-busy', 'true');
    expect(button('Roll')).toHaveAttribute('aria-disabled', 'true');
    expect(button('Roll')).toHaveFocus(); // aria-disabled keeps focus on the button

    await finish([2, 4, 9]);
    expect(status()).toHaveTextContent('d6: 3, d6: 5, d10: 10. Total: 18.');
    expect(results()).not.toHaveAttribute('aria-busy');
    const chips = [...results().querySelectorAll('.die-result')].map((c) => c.textContent);
    expect(chips).toEqual(['d63', 'd65', 'd1010']);
    expect(within(results()).getByText('18')).toHaveClass('results__total-value');
    expect(table.highlight).toHaveBeenCalledWith([null, null, null]);
    expect(button('Roll')).not.toHaveAttribute('aria-disabled');
    // The tray is kept, so the same group can be rolled again or changed.
    expect(trayChips()).toHaveLength(3);
  });

  it('highlights a natural 20 and a natural 1 on the d20', async () => {
    const { user, table, finish } = mount();
    await user.click(button('Add d20 to tray'));
    await user.click(button('Add d20 to tray'));
    await user.click(button('Add d6 to tray'));
    await user.click(button('Roll'));
    await finish([19, 0, 0]);

    expect(table.highlight).toHaveBeenCalledWith(['success', 'failure', null]);
    const [nat20, nat1, d6] = [...results().querySelectorAll('.die-result')];
    expect(nat20).toHaveClass('die-result--success');
    expect(nat20).toHaveTextContent('Nat 20');
    expect(nat1).toHaveClass('die-result--failure');
    expect(nat1).toHaveTextContent('Nat 1');
    expect(d6).not.toHaveClass('die-result--success', 'die-result--failure');
    expect(status()).toHaveTextContent(
      'd20: 20 (critical success), d20: 1 (critical failure), d6: 1. Total: 22.',
    );
  });

  it('ignores Roll while dice are rolling', async () => {
    const { user, table, finish } = mount();
    await user.click(button('Add d6 to tray'));
    await user.click(button('Roll'));
    await user.click(button('Roll'));
    await user.click(button('Roll again'));
    expect(table.roll).toHaveBeenCalledTimes(1);
    await finish([0]);
  });

  it('lets the tray change while rolling without affecting the roll', async () => {
    const { user, table, finish } = mount();
    await user.click(button('Add d6 to tray'));
    await user.click(button('Roll'));
    await user.click(button('Add d8 to tray'));
    await finish([5]);
    expect(table.roll.mock.calls[0]![0]).toHaveLength(1);
    expect(status()).toHaveTextContent('d6: 6. Total: 6.');
    expect(trayChips()).toHaveLength(2);
  });

  it('Roll again re-throws the last rolled group even after the tray changed', async () => {
    const { user, table, finish } = mount();
    await user.click(button('Add d12 to tray'));
    await user.click(button('Add d4 to tray'));
    await user.click(button('Roll'));
    await finish([0, 0]);
    expect(button('Roll again')).not.toHaveAttribute('aria-disabled');

    await user.click(button('Clear tray'));
    await user.click(button('Roll again'));
    expect(table.roll).toHaveBeenLastCalledWith(
      ['d12', 'd4'].map((id) => expect.objectContaining({ id })),
    );
    await finish([11, 3]);
    expect(status()).toHaveTextContent('d12: 12, d4: 4. Total: 16.');
  });

  it('shows an error if the roll fails, and allows retrying', async () => {
    const { user, fail, finish } = mount();
    await user.click(button('Add d6 to tray'));
    await user.click(button('Roll'));
    await fail();
    expect(status()).toHaveTextContent(/Something went wrong/);
    expect(results()).toHaveTextContent('Add dice to the tray and press Roll.');
    expect(historyEntries()).toHaveLength(0);
    expect(button('Roll')).not.toHaveAttribute('aria-disabled');

    await user.click(button('Roll'));
    await finish([1]);
    expect(status()).toHaveTextContent('d6: 2. Total: 2.');
  });
});

describe('history', () => {
  it('records each roll newest first with its group, values and total', async () => {
    const { user, finish } = mount();
    await user.click(button('Add d6 to tray'));
    await user.click(button('Roll'));
    await finish([2]);
    await user.click(button('Add d20 to tray'));
    await user.click(button('Roll'));
    await finish([5, 19]);

    const entries = historyEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0]).toHaveTextContent('1 × d6 + 1 × d20');
    expect(entries[0]).toHaveTextContent('Total 26');
    expect(entries[0]!.querySelector('.history__value--success')).toHaveTextContent('d20 20');
    expect(entries[1]).toHaveTextContent('1 × d6');
    expect(entries[1]).toHaveTextContent('d6 3');
    expect(root.querySelector('.history__summary')).toHaveTextContent('History (2)');
    expect(root.querySelector('.history__empty')).toHaveAttribute('hidden');
  });

  it(`keeps only the last ${MAX_HISTORY} rolls`, async () => {
    const { user, finish } = mount();
    await user.click(button('Add d6 to tray'));
    for (let i = 0; i < MAX_HISTORY + 3; i++) {
      await user.click(button('Roll'));
      await finish([i % 6]);
    }
    expect(historyEntries()).toHaveLength(MAX_HISTORY);
  });

  it('empties with Clear history', async () => {
    const { user, finish } = mount();
    expect(button('Clear history')).toHaveAttribute('aria-disabled', 'true');
    await user.click(button('Add d6 to tray'));
    await user.click(button('Roll'));
    await finish([0]);
    await user.click(button('Clear history'));
    expect(historyEntries()).toHaveLength(0);
    expect(root.querySelector('.history__empty')).not.toHaveAttribute('hidden');
    expect(button('Clear history')).toHaveAttribute('aria-disabled', 'true');
    await user.click(button('Clear history'));
    expect(historyEntries()).toHaveLength(0);
  });
});

describe('without WebGL', () => {
  it('shows a message and makes adding and rolling unavailable', async () => {
    const user = userEvent.setup();
    mountApp(root, {
      createTable: () => {
        throw new Error('no webgl');
      },
    });
    expect(getByRole(root, 'region', { name: 'Dice table' })).toHaveTextContent(
      /WebGL is unavailable/,
    );
    const add = button('Add d6 to tray');
    expect(add).toHaveAttribute('aria-disabled', 'true');
    await user.click(add);
    expect(trayChips()).toHaveLength(0);
    expect(button('Roll')).toHaveAttribute('aria-disabled', 'true');
    expect(status()).toHaveTextContent('');
  });
});

describe('lifecycle', () => {
  it('disposes the table and clears the root', () => {
    const { app, table } = mount();
    app.dispose();
    expect(table.dispose).toHaveBeenCalled();
    expect(root).toBeEmptyDOMElement();
  });

  it('replaces existing content when mounted twice', () => {
    mount();
    mount();
    expect(root.querySelectorAll('main')).toHaveLength(1);
  });
});
