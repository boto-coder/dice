// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getByLabelText, getByRole, queryByRole } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { findDie } from '../../src/core/dice';
import { DEFAULT_STYLE, PRESETS, type DiceStyle } from '../../src/core/diceStyle';
import { createStyleEditor, type StylePreview } from '../../src/ui/styleEditor';

const ruby = PRESETS.find((p) => p.id === 'ruby')!;

function fakePreview() {
  const preview = { show: vi.fn<StylePreview['show']>(), dispose: vi.fn() };
  const createPreview = vi.fn(() => preview);
  return { preview, createPreview };
}

let host: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '<div></div>';
  host = document.body.firstElementChild as HTMLElement;
});

function mount(extra: Partial<Parameters<typeof createStyleEditor>[0]> = {}) {
  const onChange = vi.fn<(s: DiceStyle) => void>();
  const editor = createStyleEditor({ idPrefix: 't', onChange, ...extra });
  host.append(editor.element);
  return { editor, onChange, user: userEvent.setup() };
}

/** Sets an <input type="color"> the way a picker does: value, then "change". */
function pick(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('style editor', () => {
  it('shows the default style with every control labelled', () => {
    const { editor } = mount();
    expect(editor.style).toBe(DEFAULT_STYLE);
    expect(getByLabelText(host, 'Colour')).toHaveValue(DEFAULT_STYLE.body);
    expect(getByLabelText(host, 'Pattern')).toHaveValue('solid');
    expect(getByLabelText(host, 'Finish')).toHaveValue('matte');
    expect(getByLabelText(host, 'Numbers')).toHaveValue('auto');
    // Solid has no second colour; automatic numbers have no colour to pick.
    expect(getByLabelText(host, 'Second colour')).toBeDisabled();
    expect(getByLabelText(host, 'Number colour')).toBeDisabled();
    expect(getByRole(host, 'button', { name: 'Ivory' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('applies a preset', async () => {
    const { editor, onChange, user } = mount();
    await user.click(getByRole(host, 'button', { name: 'Ruby marble' }));
    expect(editor.style).toEqual(ruby.style);
    expect(onChange).toHaveBeenLastCalledWith(ruby.style);
    expect(getByRole(host, 'button', { name: 'Ruby marble' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(getByRole(host, 'button', { name: 'Ivory' })).toHaveAttribute('aria-pressed', 'false');
    expect(getByLabelText(host, 'Second colour')).toBeEnabled();
  });

  it('changes colour, pattern and finish, and unmarks the preset', async () => {
    const { editor, onChange, user } = mount();
    pick(getByLabelText(host, 'Colour'), '#123456');
    await user.selectOptions(getByLabelText(host, 'Pattern'), 'stripes');
    pick(getByLabelText(host, 'Second colour'), '#abcdef');
    await user.selectOptions(getByLabelText(host, 'Finish'), 'metallic');
    expect(editor.style).toEqual({
      ...DEFAULT_STYLE,
      body: '#123456',
      accent: '#abcdef',
      pattern: 'stripes',
      finish: 'metallic',
    });
    expect(onChange).toHaveBeenCalledTimes(4);
    expect(host.querySelector('[aria-pressed="true"]')).toBeNull();
  });

  it('lets the number colour be chosen, starting from the automatic one', async () => {
    const { editor, user } = mount();
    await user.selectOptions(getByLabelText(host, 'Numbers'), 'custom');
    expect(editor.style.label).toBe('#1f2328');
    expect(getByLabelText(host, 'Number colour')).toBeEnabled();
    pick(getByLabelText(host, 'Number colour'), '#ff0000');
    expect(editor.style.label).toBe('#ff0000');
    await user.selectOptions(getByLabelText(host, 'Numbers'), 'auto');
    expect(editor.style.label).toBe('auto');
  });

  it('warns when the numbers would be hard to read', async () => {
    const { user } = mount();
    expect(queryByRole(host, 'status')).toHaveTextContent('');
    await user.selectOptions(getByLabelText(host, 'Numbers'), 'custom');
    pick(getByLabelText(host, 'Number colour'), '#f0f0f0');
    expect(getByRole(host, 'status')).toHaveTextContent(/hard to read/);
  });

  it('setStyle shows a style without reporting a change', () => {
    const { editor, onChange } = mount();
    editor.setStyle(ruby.style);
    expect(getByLabelText(host, 'Pattern')).toHaveValue('marble');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('previews the die in the current style while started', async () => {
    const { preview, createPreview } = fakePreview();
    const { editor, user } = mount({ createPreview });
    const d20 = findDie('d20')!;
    editor.setPreviewDie(d20);
    expect(createPreview).not.toHaveBeenCalled();
    editor.start();
    expect(createPreview).toHaveBeenCalledOnce();
    expect(preview.show).toHaveBeenLastCalledWith({ ...d20, style: DEFAULT_STYLE });
    await user.click(getByRole(host, 'button', { name: 'Ruby marble' }));
    expect(preview.show).toHaveBeenLastCalledWith({ ...d20, style: ruby.style });
    editor.start(); // already running: no second preview
    expect(createPreview).toHaveBeenCalledOnce();
    editor.stop();
    expect(preview.dispose).toHaveBeenCalledOnce();
  });

  it('shows a note instead of the preview when 3D is unavailable', () => {
    const { editor } = mount({
      createPreview: () => {
        throw new Error('no WebGL');
      },
    });
    editor.start();
    expect(host.querySelector('.style-editor__preview--none')).not.toBeNull();
  });
});
