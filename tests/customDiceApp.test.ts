// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getByRole, queryAllByRole, within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { mountApp } from '../src/app';
import { STORAGE_KEY } from '../src/core/storage';
import type { DiceTable } from '../src/render/table';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: vi.fn((k: string) => data.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => void data.set(k, v)),
  };
}

const COMBAT = {
  version: 1,
  dice: [{ id: 'custom-combat', name: 'Combat', faces: ['⚔️', '⚔️', '🛡️', '🛡️', '💀', ''] }],
};

let root: HTMLElement;
let resolveRoll: (faces: number[]) => void;
const table = {
  roll: vi.fn<DiceTable['roll']>(() => new Promise((res) => (resolveRoll = res))),
  highlight: vi.fn(),
  setTheme: vi.fn(),
  prepare: vi.fn(),
  dispose: vi.fn(),
} satisfies DiceTable;

const button = (name: string | RegExp, scope: HTMLElement = root) =>
  getByRole(scope, 'button', { name });
const dialog = () => root.querySelector<HTMLDialogElement>('dialog')!;
const status = () => getByRole(root, 'status');
const trayChips = () =>
  queryAllByRole(getByRole(root, 'region', { name: 'Tray' }), 'button', { name: /^Remove / });

function mount(storage = memoryStorage()) {
  mountApp(root, { createTable: () => table, storage });
  return { storage, user: userEvent.setup() };
}

async function finish(faces: number[]) {
  resolveRoll(faces);
  await vi.waitFor(() => expect(status().textContent).not.toBe('Rolling…'));
}

async function createDie(user: ReturnType<typeof userEvent.setup>, name: string, faces: string[]) {
  await user.click(button('Manage'));
  await user.click(button('New custom die', dialog()));
  const d = within(dialog());
  await user.type(d.getByLabelText('Name'), name);
  await user.selectOptions(d.getByLabelText('Number of faces'), String(faces.length));
  for (const [i, face] of faces.entries()) {
    if (face !== '') await user.type(d.getByLabelText(`Face ${i + 1}`), face);
  }
  await user.click(button('Save', dialog()));
}

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById('app')!;
  table.roll.mockClear();
});

describe('custom dice manager', () => {
  it('opens and closes, returning focus to the Manage button', async () => {
    const { user } = mount();
    expect(root).toHaveTextContent('None yet. Use Manage to recreate a lost board-game die.');
    await user.click(button('Manage'));
    expect(dialog()).toHaveAttribute('open');
    expect(dialog()).toHaveAccessibleName('Custom dice');
    expect(dialog()).toHaveTextContent('No custom dice yet.');
    expect(button('New custom die', dialog())).toHaveFocus();
    await user.click(button('Close', dialog()));
    expect(dialog()).not.toHaveAttribute('open');
    expect(button('Manage')).toHaveFocus();
  });

  it('creates a symbol die, saves it, and offers it in the custom dice bar', async () => {
    const { user, storage } = mount();
    await createDie(user, 'Combat', ['⚔️', '⚔️', '🛡️', '🛡️', '💀', '']);

    const item = within(dialog()).getByRole('listitem');
    expect(item).toHaveTextContent('Combat');
    expect(item).toHaveTextContent('d6 · ⚔️ ⚔️ 🛡️ 🛡️ 💀 –');
    expect(button('Edit Combat', dialog())).toHaveFocus();

    const saved = JSON.parse(storage.data.get(STORAGE_KEY)!);
    expect(saved.dice[0]).toMatchObject({
      name: 'Combat',
      faces: ['⚔️', '⚔️', '🛡️', '🛡️', '💀', ''],
    });
    const bar = getByRole(root, 'group', { name: 'Add custom dice' });
    expect(button('Add Combat to tray', bar)).toHaveTextContent('Combat');
  });

  it('starts new dice with 6 empty faces and keeps values when the face count changes', async () => {
    const { user } = mount();
    await user.click(button('Manage'));
    await user.click(button('New custom die', dialog()));
    const d = within(dialog());
    expect(d.getByRole('heading', { name: 'New custom die' })).toBeInTheDocument();
    expect(d.getByLabelText('Name')).toHaveFocus();
    expect(d.getAllByRole('textbox', { name: /^Face / })).toHaveLength(6);

    await user.type(d.getByLabelText('Face 1'), 'A');
    await user.type(d.getByLabelText('Face 6'), 'F');
    await user.selectOptions(d.getByLabelText('Number of faces'), '4');
    expect(d.getAllByRole('textbox', { name: /^Face / })).toHaveLength(4);
    await user.selectOptions(d.getByLabelText('Number of faces'), '8');
    expect(d.getByLabelText('Face 1')).toHaveValue('A');
    expect(d.getByLabelText('Face 6')).toHaveValue('');
    expect(d.getAllByRole('textbox', { name: /^Face / })).toHaveLength(8);
  });

  it('shows validation errors next to the fields and focuses the first one', async () => {
    const { user, storage } = mount();
    await user.click(button('Manage'));
    await user.click(button('New custom die', dialog()));
    await user.click(button('Save', dialog()));
    const d = within(dialog());
    expect(d.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
    expect(d.getByLabelText('Name')).toHaveAccessibleDescription('Name is required.');
    expect(d.getByLabelText('Name')).toHaveFocus();
    expect(dialog()).toHaveTextContent('At least one face must have a label.');
    expect(storage.setItem).not.toHaveBeenCalled();

    await user.type(d.getByLabelText('Name'), 'Long');
    await user.type(d.getByLabelText('Face 3'), 'abcdefg');
    await user.click(button('Save', dialog()));
    expect(d.getByLabelText('Name')).not.toHaveAttribute('aria-invalid');
    expect(d.getByLabelText('Face 3')).toHaveAttribute('aria-invalid', 'true');
    expect(d.getByLabelText('Face 3')).toHaveFocus();
    expect(dialog()).toHaveTextContent('Face 3 must be at most 6 characters.');
  });

  it('rejects a duplicate name', async () => {
    const { user } = mount(memoryStorage({ [STORAGE_KEY]: JSON.stringify(COMBAT) }));
    await createDie(user, 'combat', ['1', '2', '3', '4']);
    expect(dialog()).toHaveTextContent('A custom die with this name already exists.');
  });

  it('cancels editing without saving', async () => {
    const { user, storage } = mount();
    await user.click(button('Manage'));
    await user.click(button('New custom die', dialog()));
    await user.type(within(dialog()).getByLabelText('Name'), 'Nope');
    await user.click(button('Cancel', dialog()));
    expect(dialog()).toHaveTextContent('No custom dice yet.');
    expect(button('New custom die', dialog())).toHaveFocus();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('edits a die, keeping its id, prefilled with its faces', async () => {
    const { user, storage } = mount(memoryStorage({ [STORAGE_KEY]: JSON.stringify(COMBAT) }));
    await user.click(button('Manage'));
    await user.click(button('Edit Combat', dialog()));
    const d = within(dialog());
    expect(d.getByRole('heading', { name: 'Edit Combat' })).toBeInTheDocument();
    expect(d.getByLabelText('Name')).toHaveValue('Combat');
    expect(d.getByLabelText('Face 5')).toHaveValue('💀');
    // Editing keeps the die's own name allowed.
    await user.clear(d.getByLabelText('Face 6'));
    await user.type(d.getByLabelText('Face 6'), '🏹');
    await user.click(button('Save', dialog()));

    const saved = JSON.parse(storage.data.get(STORAGE_KEY)!);
    expect(saved.dice).toHaveLength(1);
    expect(saved.dice[0]).toMatchObject({
      id: 'custom-combat',
      faces: expect.arrayContaining(['🏹']),
    });
    expect(button('Edit Combat', dialog())).toHaveFocus();
  });

  it('returns focus to the Edit button when an edit is cancelled', async () => {
    const { user } = mount(memoryStorage({ [STORAGE_KEY]: JSON.stringify(COMBAT) }));
    await user.click(button('Manage'));
    await user.click(button('Edit Combat', dialog()));
    await user.click(button('Cancel', dialog()));
    expect(button('Edit Combat', dialog())).toHaveFocus();
  });

  it('asks before deleting, and Keep cancels', async () => {
    const { user, storage } = mount(memoryStorage({ [STORAGE_KEY]: JSON.stringify(COMBAT) }));
    await user.click(button('Manage'));
    await user.click(button('Delete Combat', dialog()));
    expect(dialog()).toHaveTextContent('Delete this die?');
    expect(button('Keep Combat', dialog())).toHaveFocus();
    await user.click(button('Keep Combat', dialog()));
    expect(button('Delete Combat', dialog())).toHaveFocus();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('deletes a die and removes it from the tray and from Roll again', async () => {
    const { user, storage } = mount(memoryStorage({ [STORAGE_KEY]: JSON.stringify(COMBAT) }));
    await user.click(button('Add Combat to tray'));
    await user.click(button('Roll'));
    await finish([4]);
    await user.click(button('Add d6 to tray'));

    await user.click(button('Manage'));
    await user.click(button('Delete Combat', dialog()));
    await user.click(button('Yes, delete Combat', dialog()));
    expect(dialog()).toHaveTextContent('No custom dice yet.');
    expect(JSON.parse(storage.data.get(STORAGE_KEY)!).dice).toEqual([]);
    expect(trayChips().map((c) => c.textContent)).toEqual(['d6']);
    expect(button('Roll again')).toHaveAttribute('aria-disabled', 'true');
    // History keeps the roll that used the deleted die.
    expect(root.querySelector('.history__entry')).toHaveTextContent('Combat 💀');
  });
});

describe('rolling custom dice', () => {
  it('loads saved dice and rolls them mixed with standard dice, summing only numbers', async () => {
    const { user } = mount(memoryStorage({ [STORAGE_KEY]: JSON.stringify(COMBAT) }));
    await user.click(button('Add Combat to tray'));
    await user.click(button('Add Combat to tray'));
    await user.click(button('Add d6 to tray'));
    expect(getByRole(root, 'region', { name: 'Tray' })).toHaveTextContent('2 × Combat + 1 × d6');
    await user.click(button('Roll'));
    expect(table.roll).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'custom-combat', custom: true, shape: 'd6' }),
      expect.objectContaining({ id: 'custom-combat' }),
      expect.objectContaining({ id: 'd6' }),
    ]);
    await finish([0, 5, 2]);
    expect(status()).toHaveTextContent('Combat: ⚔️, Combat: blank, d6: 3. Total: 3.');
  });

  it('shows no total for a roll of only symbol dice', async () => {
    const { user } = mount(memoryStorage({ [STORAGE_KEY]: JSON.stringify(COMBAT) }));
    await user.click(button('Add Combat to tray'));
    await user.click(button('Roll'));
    await finish([2]);
    expect(status()).toHaveTextContent('Combat: 🛡️.');
    expect(root.querySelector('.results__total')).toBeNull();
  });

  it('uses the edited faces on the next Roll again', async () => {
    const { user } = mount(memoryStorage({ [STORAGE_KEY]: JSON.stringify(COMBAT) }));
    await user.click(button('Add Combat to tray'));
    await user.click(button('Roll'));
    await finish([0]);
    await user.click(button('Manage'));
    await user.click(button('Edit Combat', dialog()));
    const face1 = within(dialog()).getByLabelText('Face 1');
    await user.clear(face1);
    await user.type(face1, '🔥');
    await user.click(button('Save', dialog()));
    await user.click(button('Close', dialog()));
    await user.click(button('Roll again'));
    await finish([0]);
    expect(status()).toHaveTextContent('Combat: 🔥.');
  });

  it('adds custom dice only while the tray has room', async () => {
    const { user } = mount(memoryStorage({ [STORAGE_KEY]: JSON.stringify(COMBAT) }));
    const add = button('Add Combat to tray');
    for (let i = 0; i < 21; i++) await user.click(add);
    expect(trayChips()).toHaveLength(20);
    expect(add).toHaveAttribute('aria-disabled', 'true');
  });
});

describe('storage problems', () => {
  it('shows load warnings in the manager', async () => {
    const { user } = mount(memoryStorage({ [STORAGE_KEY]: '{not json' }));
    await user.click(button('Manage'));
    expect(dialog()).toHaveTextContent('Saved dice could not be read (corrupt data).');
  });

  it('warns when saving fails', async () => {
    const storage = memoryStorage();
    storage.setItem.mockImplementation(() => {
      throw new Error('quota');
    });
    const { user } = mount(storage);
    await createDie(user, 'Coin', ['H', 'T', 'H', 'T']);
    expect(dialog()).toHaveTextContent('could not be saved');
    // The die still works for this visit.
    expect(button('Add Coin to tray')).toBeInTheDocument();
  });

  it('warns when the browser blocks storage', async () => {
    mountApp(root, { createTable: () => table, storage: null });
    await userEvent.setup().click(button('Manage'));
    expect(dialog()).toHaveTextContent('could not be saved');
  });

  it('works without persistence when no storage is given', async () => {
    mountApp(root, { createTable: () => table });
    const user = userEvent.setup();
    await createDie(user, 'Coin', ['H', 'T', 'H', 'T']);
    expect(button('Add Coin to tray')).toBeInTheDocument();
    expect(root.querySelector('.manager__notice')).toHaveAttribute('hidden');
  });
});

describe('custom die look', () => {
  const look = () => within(getByRole(dialog(), 'group', { name: 'Look' }));

  it('saves a chosen look with the die and rolls it in that look', async () => {
    const { user, storage } = mount();
    await user.click(button('Manage'));
    await user.click(button('New custom die', dialog()));
    const d = within(dialog());
    await user.type(d.getByLabelText('Name'), 'Coin');
    await user.selectOptions(d.getByLabelText('Number of faces'), '4');
    for (const [i, face] of ['H', 'T', 'H', 'T'].entries()) {
      await user.type(d.getByLabelText(`Face ${i + 1}`), face);
    }
    await user.click(look().getByRole('button', { name: 'Gold' }));
    await user.click(button('Save', dialog()));

    const saved = JSON.parse(storage.data.get(STORAGE_KEY)!);
    expect(saved.version).toBe(2);
    expect(saved.dice[0].style).toMatchObject({ body: '#d4a73a', finish: 'metallic' });

    await user.click(button('Close', dialog()));
    await user.click(button('Add Coin to tray'));
    await user.click(button('Roll'));
    expect(table.roll.mock.calls[0]![0][0]!.style).toMatchObject({ body: '#d4a73a' });
    await finish([2]);
  });

  it('does not store the default look', async () => {
    const { user, storage } = mount();
    await createDie(user, 'Coin', ['H', 'T', 'H', 'T']);
    const saved = JSON.parse(storage.data.get(STORAGE_KEY)!);
    expect(saved.dice[0]).not.toHaveProperty('style');
  });

  it('shows the saved look when editing', async () => {
    const styled = {
      version: 2,
      dice: [
        {
          ...COMBAT.dice[0],
          style: {
            body: '#0b4f6c',
            accent: '#8fdcf5',
            label: 'auto',
            pattern: 'speckled',
            finish: 'matte',
          },
        },
      ],
    };
    const { user } = mount(memoryStorage({ [STORAGE_KEY]: JSON.stringify(styled) }));
    await user.click(button('Manage'));
    await user.click(button('Edit Combat', dialog()));
    expect(look().getByRole('button', { name: 'Ocean speckle' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(look().getByLabelText('Pattern')).toHaveValue('speckled');
  });
});
