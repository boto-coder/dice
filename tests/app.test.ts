// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getByRole, findByText } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { mountApp } from '../src/app';
import type { DiceTable } from '../src/render/table';

/** A table whose rolls resolve when the test says so. */
function fakeTable() {
  let resolveRoll: ((faces: number[]) => void) | null = null;
  let rejectRoll: ((e: Error) => void) | null = null;
  const table: DiceTable = {
    roll: vi.fn(
      () =>
        new Promise<number[]>((res, rej) => {
          resolveRoll = res;
          rejectRoll = rej;
        }),
    ),
    dispose: vi.fn(),
  };
  return {
    table,
    finish: (faces: number[]) => resolveRoll!(faces),
    fail: () => rejectRoll!(new Error('boom')),
  };
}

describe('mountApp', () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    root = document.getElementById('app')!;
  });

  it('renders the title, table area, roll button and live result region', () => {
    const { table } = fakeTable();
    mountApp(root, { createTable: () => table });
    const main = getByRole(root, 'main');
    expect(getByRole(main, 'heading', { level: 1, name: 'Dice Roller' })).toBeInTheDocument();
    expect(getByRole(main, 'region', { name: 'Dice table' })).toBeInTheDocument();
    expect(getByRole(main, 'button', { name: 'Roll d6' })).toBeEnabled();
    expect(getByRole(main, 'status')).toHaveAttribute('aria-live', 'polite');
  });

  it('creates the table inside the table region', () => {
    const { table } = fakeTable();
    const createTable = vi.fn(() => table);
    mountApp(root, { createTable });
    expect(createTable).toHaveBeenCalledWith(getByRole(root, 'region', { name: 'Dice table' }));
  });

  it('rolls a d6 and announces the result', async () => {
    const user = userEvent.setup();
    const fake = fakeTable();
    mountApp(root, { createTable: () => fake.table });
    const button = getByRole(root, 'button', { name: 'Roll d6' });

    await user.click(button);
    expect(fake.table.roll).toHaveBeenCalledWith([expect.objectContaining({ id: 'd6' })]);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(getByRole(root, 'status')).toHaveTextContent('Rolling…');

    fake.finish([3]);
    expect(await findByText(root, 'd6: 4. Total: 4.')).toBeInTheDocument();
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('aria-busy');
  });

  it('shows an error message if the roll fails, and allows retrying', async () => {
    const user = userEvent.setup();
    const fake = fakeTable();
    mountApp(root, { createTable: () => fake.table });
    const button = getByRole(root, 'button', { name: 'Roll d6' });

    await user.click(button);
    fake.fail();
    expect(await findByText(root, /Something went wrong/)).toBeInTheDocument();
    expect(button).toBeEnabled();
  });

  it('shows a message and disables rolling when WebGL is unavailable', async () => {
    const user = userEvent.setup();
    mountApp(root, {
      createTable: () => {
        throw new Error('no webgl');
      },
    });
    const region = getByRole(root, 'region', { name: 'Dice table' });
    expect(region).toHaveTextContent(/WebGL is unavailable/);
    const button = getByRole(root, 'button', { name: 'Roll d6' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(getByRole(root, 'status')).toHaveTextContent('');
  });

  it('disposes the table and clears the root', () => {
    const { table } = fakeTable();
    const app = mountApp(root, { createTable: () => table });
    app.dispose();
    expect(table.dispose).toHaveBeenCalled();
    expect(root).toBeEmptyDOMElement();
  });

  it('replaces existing content when mounted twice', () => {
    mountApp(root, { createTable: () => fakeTable().table });
    mountApp(root, { createTable: () => fakeTable().table });
    expect(root.querySelectorAll('main')).toHaveLength(1);
  });
});
