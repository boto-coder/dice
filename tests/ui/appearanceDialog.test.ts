// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getByLabelText, getByRole } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { createCustomDie } from '../../src/core/customDice';
import {
  DEFAULT_STYLE,
  PRESETS,
  type DiceStyle,
  type StandardDiceStyles,
} from '../../src/core/diceStyle';
import { createAppearanceDialog } from '../../src/ui/appearanceDialog';

const gold = PRESETS.find((p) => p.id === 'gold')!.style;
const ocean = PRESETS.find((p) => p.id === 'ocean')!.style;
const pips = createCustomDie(
  { name: 'Pips', faces: ['1', '1', '2', '3'], style: ocean },
  { id: 'custom-p' },
);

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<main></main>';
  root = document.querySelector('main')!;
});

function mount(standard: StandardDiceStyles = {}) {
  const callbacks = {
    onStandardStyle: vi.fn<(id: string, s: DiceStyle) => void>(),
    onAllStandard: vi.fn<(s: DiceStyle) => void>(),
    onCustomStyle: vi.fn<(id: string, s: DiceStyle) => void>(),
  };
  const preview = { show: vi.fn(), dispose: vi.fn() };
  const dialog = createAppearanceDialog(root, {
    getStandardStyles: () => standard,
    getCustomDice: () => [pips],
    createPreview: () => preview,
    ...callbacks,
  });
  return { dialog, preview, ...callbacks, user: userEvent.setup() };
}

const panel = () => getByRole(root, 'dialog', { name: 'Dice appearance' });

describe('appearance dialog', () => {
  it('opens on the d20 with its style, focused on the die picker', () => {
    const { dialog, preview } = mount({ d20: gold });
    dialog.open();
    const picker = getByLabelText(panel(), 'Die');
    expect(picker).toHaveValue('d20');
    expect(picker).toHaveFocus();
    expect(getByRole(panel(), 'button', { name: 'Gold' })).toHaveAttribute('aria-pressed', 'true');
    expect(preview.show).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'd20', style: gold }),
    );
  });

  it('lists the standard and custom dice', () => {
    const { dialog } = mount();
    dialog.open();
    const options = [...(getByLabelText(panel(), 'Die') as HTMLSelectElement).options];
    expect(options.map((o) => o.textContent)).toEqual([
      'd4',
      'd6',
      'd8',
      'd10',
      'd12',
      'd20',
      'd100',
      'Pips',
    ]);
  });

  it('saves a new style for the chosen standard die', async () => {
    const { dialog, onStandardStyle, user } = mount();
    dialog.open();
    await user.selectOptions(getByLabelText(panel(), 'Die'), 'd6');
    await user.click(getByRole(panel(), 'button', { name: 'Gold' }));
    expect(onStandardStyle).toHaveBeenCalledWith('d6', gold);
  });

  it('saves a custom die style through its own callback, and shows its current look', async () => {
    const { dialog, onCustomStyle, onStandardStyle, user } = mount();
    dialog.open();
    await user.selectOptions(getByLabelText(panel(), 'Die'), 'custom-p');
    expect(getByRole(panel(), 'button', { name: 'Ocean speckle' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // "All standard dice" makes no sense for a custom die.
    expect(panel().querySelector<HTMLButtonElement>('[data-action="apply-all"]')!.hidden).toBe(
      true,
    );
    await user.click(getByRole(panel(), 'button', { name: 'Gold' }));
    expect(onCustomStyle).toHaveBeenCalledWith('custom-p', gold);
    expect(onStandardStyle).not.toHaveBeenCalled();
  });

  it('applies the shown look to all standard dice', async () => {
    const { dialog, onAllStandard, user } = mount({ d20: gold });
    dialog.open();
    await user.click(getByRole(panel(), 'button', { name: 'Use this look for all standard dice' }));
    expect(onAllStandard).toHaveBeenCalledWith(gold);
  });

  it('resets a die to Ivory', async () => {
    const { dialog, onStandardStyle, user } = mount({ d20: gold });
    dialog.open();
    await user.click(getByRole(panel(), 'button', { name: 'Reset to Ivory' }));
    expect(onStandardStyle).toHaveBeenCalledWith('d20', DEFAULT_STYLE);
    expect(getByRole(panel(), 'button', { name: 'Ivory' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('closes with Done, stops the preview and returns focus', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const { dialog, preview, user } = mount();
    dialog.open();
    await user.click(getByRole(panel(), 'button', { name: 'Done' }));
    expect(panel).toThrow();
    expect(preview.dispose).toHaveBeenCalled();
    expect(opener).toHaveFocus();
  });

  it('closes with the close button', async () => {
    const { dialog, user } = mount();
    dialog.open();
    await user.click(getByRole(panel(), 'button', { name: 'Close' }));
    expect(dialog.dialog).not.toHaveAttribute('open');
  });
});
