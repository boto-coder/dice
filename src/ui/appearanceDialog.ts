import { STANDARD_DICE, type DieDefinition, type DieShape } from '../core/dice';
import { DEFAULT_STYLE, styleOf, type DiceStyle, type StandardDiceStyles } from '../core/diceStyle';
import { closeDialog, openDialog } from './dialog';
import { createStyleEditor, type CreatePreview } from './styleEditor';
import { el } from './views';

export interface AppearanceDialogOptions {
  getStandardStyles(): StandardDiceStyles;
  getCustomDice(): readonly DieDefinition[];
  /** A standard die (d4 … d100) got a new style. */
  onStandardStyle(id: DieShape, style: DiceStyle): void;
  /** Every standard die gets this style. */
  onAllStandard(style: DiceStyle): void;
  /** A custom die got a new style. */
  onCustomStyle(id: string, style: DiceStyle): void;
  readonly createPreview?: CreatePreview | undefined;
}

export interface AppearanceDialog {
  readonly dialog: HTMLDialogElement;
  open(): void;
  close(): void;
}

/** Builds the "Dice appearance" dialog and appends it to `parent`. */
export function createAppearanceDialog(
  parent: HTMLElement,
  options: AppearanceDialogOptions,
): AppearanceDialog {
  const dialog = el('dialog', 'dialog dialog--wide');
  dialog.setAttribute('aria-labelledby', 'appearance-title');
  dialog.innerHTML = `
    <div class="dialog__header">
      <h2 class="dialog__title" id="appearance-title">Dice appearance</h2>
      <button type="button" class="btn btn--small btn--icon" data-action="close-appearance" aria-label="Close">✕</button>
    </div>
    <p class="appearance__intro">Each kind of die has its own look. It never changes the results.</p>
    <div class="field">
      <label class="field__label" for="appearance-die">Die</label>
      <select class="field__input" id="appearance-die"></select>
    </div>
    <div class="appearance__editor"></div>
    <div class="appearance__actions">
      <button type="button" class="btn" data-action="apply-all">Use this look for all standard dice</button>
      <button type="button" class="btn" data-action="reset-style">Reset to Ivory</button>
      <button type="button" class="btn btn--primary" data-action="done">Done</button>
    </div>
  `;
  parent.append(dialog);

  const q = <T extends Element>(selector: string): T => dialog.querySelector<T>(selector)!;
  const dieSelect = q<HTMLSelectElement>('#appearance-die');
  const applyAll = q<HTMLButtonElement>('[data-action="apply-all"]');
  let opener: HTMLElement | null = null;

  const editor = createStyleEditor({
    idPrefix: 'appearance',
    createPreview: options.createPreview,
    onChange(style) {
      save(style);
    },
  });
  q('.appearance__editor').append(editor.element);

  function selectedDie(): DieDefinition {
    const id = dieSelect.value;
    return (
      STANDARD_DICE.find((d) => d.id === id) ??
      options.getCustomDice().find((d) => d.id === id) ??
      STANDARD_DICE[0]!
    );
  }

  function save(style: DiceStyle): void {
    const die = selectedDie();
    if (die.custom) options.onCustomStyle(die.id, style);
    else options.onStandardStyle(die.id as DieShape, style);
  }

  function showSelected(): void {
    const die = selectedDie();
    editor.setStyle(styleOf(die, options.getStandardStyles()));
    editor.setPreviewDie(die);
    applyAll.hidden = die.custom;
  }

  function renderDieOptions(keep: string): void {
    const standard = el('optgroup');
    standard.label = 'Standard dice';
    standard.append(
      ...STANDARD_DICE.map((d) => {
        const o = el('option', undefined, d.name);
        o.value = d.id;
        return o;
      }),
    );
    const groups: HTMLElement[] = [standard];
    const custom = options.getCustomDice();
    if (custom.length > 0) {
      const g = el('optgroup');
      g.label = 'Custom dice';
      g.append(
        ...custom.map((d) => {
          const o = el('option', undefined, d.name);
          o.value = d.id;
          return o;
        }),
      );
      groups.push(g);
    }
    dieSelect.replaceChildren(...groups);
    dieSelect.value = [...dieSelect.options].some((o) => o.value === keep) ? keep : 'd20';
  }

  dieSelect.addEventListener('change', showSelected);
  applyAll.addEventListener('click', () => options.onAllStandard(editor.style));
  q('[data-action="reset-style"]').addEventListener('click', () => {
    editor.setStyle(DEFAULT_STYLE);
    save(DEFAULT_STYLE);
  });
  q('[data-action="done"]').addEventListener('click', () => closeDialog(dialog));
  q('[data-action="close-appearance"]').addEventListener('click', () => closeDialog(dialog));
  dialog.addEventListener('close', () => {
    editor.stop();
    opener?.focus();
    opener = null;
  });

  return {
    dialog,
    open() {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      renderDieOptions(dieSelect.value || 'd20');
      openDialog(dialog);
      editor.start();
      showSelected();
      dieSelect.focus();
    },
    close() {
      closeDialog(dialog);
    },
  };
}
