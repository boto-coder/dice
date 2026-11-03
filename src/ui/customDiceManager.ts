import {
  ALLOWED_FACE_COUNTS,
  MAX_FACE_LENGTH,
  MAX_NAME_LENGTH,
  createCustomDie,
  parseFace,
  toCustomDieInput,
  validateCustomDie,
  type ValidationError,
} from '../core/customDice';
import { shapeForFaceCount, type DieDefinition } from '../core/dice';
import { DEFAULT_STYLE, sameStyle } from '../core/diceStyle';
import { closeDialog, openDialog } from './dialog';
import { createStyleEditor, type CreatePreview } from './styleEditor';
import { el } from './views';

export interface CustomDiceManagerOptions {
  /** The current custom dice. */
  getDice(): readonly DieDefinition[];
  /** Called with a new or edited die (an edited die keeps its id). */
  onSave(die: DieDefinition): void;
  onDelete(id: string): void;
  /** Creates the 3D preview in the editor; omit for none. */
  readonly createPreview?: CreatePreview | undefined;
}

export interface CustomDiceManager {
  readonly dialog: HTMLDialogElement;
  /** Opens the manager list. */
  open(): void;
  close(): void;
  /** Shows a notice in the manager, e.g. about storage problems. Empty text hides it. */
  setNotice(text: string): void;
}

const DEFAULT_FACE_COUNT = 6;

/** Short face summary for the list, e.g. "⚔️ ⚔️ 🛡️ 🛡️ 💀 –". */
export function faceSummary(die: DieDefinition): string {
  return die.faces.map((f) => (f.label === '' ? '–' : f.label)).join(' ');
}

/** Builds the custom-dice manager dialog (list + editor) and appends it to `parent`. */
export function createCustomDiceManager(
  parent: HTMLElement,
  options: CustomDiceManagerOptions,
): CustomDiceManager {
  const dialog = el('dialog', 'dialog');
  dialog.setAttribute('aria-labelledby', 'manager-title');
  dialog.innerHTML = `
    <div class="dialog__header">
      <h2 class="dialog__title" id="manager-title">Custom dice</h2>
      <button type="button" class="btn btn--small btn--icon" data-action="close-manager" aria-label="Close">✕</button>
    </div>
    <p class="manager__notice" hidden></p>
    <div class="manager">
      <p class="manager__intro">Recreate a lost board-game die, or make your own. Custom dice are saved in this browser.</p>
      <ul class="manager__list"></ul>
      <p class="manager__empty">No custom dice yet.</p>
      <button type="button" class="btn btn--primary" data-action="new-die">New custom die</button>
    </div>
    <form class="editor" hidden novalidate>
      <h3 class="editor__title"></h3>
      <div class="field">
        <label class="field__label" for="die-name">Name</label>
        <input class="field__input" id="die-name" name="name" autocomplete="off" aria-describedby="die-name-error" />
        <p class="field__error" id="die-name-error"></p>
      </div>
      <div class="field">
        <label class="field__label" for="die-count">Number of faces</label>
        <select class="field__input" id="die-count" name="count">
          ${ALLOWED_FACE_COUNTS.map((n) => `<option value="${n}">${n}</option>`).join('')}
        </select>
      </div>
      <fieldset class="editor__faces-set" aria-describedby="faces-help faces-error">
        <legend class="field__label">Faces</legend>
        <p class="editor__help" id="faces-help">Numbers, words (up to ${MAX_FACE_LENGTH} characters) or emoji. Leave a face empty for a blank face. Repeat a face to make it more likely.</p>
        <ol class="editor__faces"></ol>
        <p class="field__error" id="faces-error"></p>
      </fieldset>
      <fieldset class="editor__look">
        <legend class="field__label">Look</legend>
      </fieldset>
      <div class="editor__actions">
        <button type="submit" class="btn btn--primary">Save</button>
        <button type="button" class="btn" data-action="cancel-edit">Cancel</button>
      </div>
    </form>
  `;
  parent.append(dialog);

  const q = <T extends Element>(selector: string): T => dialog.querySelector<T>(selector)!;
  const notice = q<HTMLElement>('.manager__notice');
  const listView = q<HTMLElement>('.manager');
  const list = q<HTMLElement>('.manager__list');
  const empty = q<HTMLElement>('.manager__empty');
  const newButton = q<HTMLButtonElement>('[data-action="new-die"]');
  const form = q<HTMLFormElement>('.editor');
  const formTitle = q<HTMLElement>('.editor__title');
  const nameInput = q<HTMLInputElement>('#die-name');
  const nameError = q<HTMLElement>('#die-name-error');
  const countSelect = q<HTMLSelectElement>('#die-count');
  const facesList = q<HTMLElement>('.editor__faces');
  const facesError = q<HTMLElement>('#faces-error');

  const look = createStyleEditor({
    idPrefix: 'die-style',
    createPreview: options.createPreview,
    onChange: () => updatePreview(),
  });
  q('.editor__look').append(look.element);

  let editingId: string | null = null;
  let opener: HTMLElement | null = null;

  function faceInputs(): HTMLInputElement[] {
    return [...facesList.querySelectorAll<HTMLInputElement>('input')];
  }

  /** Rebuilds the face inputs for `count` faces, keeping existing values by position. */
  function setFaceCount(
    count: number,
    values: readonly string[] = faceInputs().map((i) => i.value),
  ): void {
    countSelect.value = String(count);
    facesList.replaceChildren(
      ...Array.from({ length: count }, (_, i) => {
        const li = el('li', 'editor__face');
        const id = `die-face-${i}`;
        const label = el('label', 'editor__face-label');
        label.htmlFor = id;
        label.append(el('span', 'visually-hidden', 'Face'), ` ${i + 1}`);
        const input = el('input', 'field__input editor__face-input');
        input.id = id;
        input.autocomplete = 'off';
        input.value = values[i] ?? '';
        li.append(label, input);
        return li;
      }),
    );
  }

  /** The die as currently typed in, for the preview (even if not valid yet). */
  function updatePreview(): void {
    const labels = faceInputs().map((i) => i.value);
    const shape = shapeForFaceCount(labels.length);
    if (!shape) return;
    look.setPreviewDie({
      id: editingId ?? 'preview',
      name: nameInput.value,
      shape,
      faces: labels.map(parseFace),
      custom: true,
    });
  }

  function clearErrors(): void {
    nameError.textContent = '';
    facesError.textContent = '';
    nameInput.removeAttribute('aria-invalid');
    for (const input of faceInputs()) input.removeAttribute('aria-invalid');
  }

  function showErrors(errors: readonly ValidationError[]): void {
    clearErrors();
    const inputs = faceInputs();
    const faceMessages: string[] = [];
    for (const e of errors) {
      if (e.field === 'name') {
        nameError.textContent = e.message;
        nameInput.setAttribute('aria-invalid', 'true');
      } else {
        faceMessages.push(e.message);
        if (e.index !== undefined) inputs[e.index]?.setAttribute('aria-invalid', 'true');
      }
    }
    facesError.textContent = faceMessages.join(' ');
    const first = errors[0]!;
    const target = first.field === 'name' ? nameInput : (inputs[first.index ?? 0] ?? countSelect);
    target.focus();
  }

  /** Shows the list, focusing the Edit button of die `focusId` if given, else New custom die. */
  function showList(focusId: string | null = null): void {
    look.stop();
    form.hidden = true;
    listView.hidden = false;
    editingId = null;
    renderList();
    const edit = focusId
      ? rowFor(focusId)?.querySelector<HTMLElement>('[data-action="edit"]')
      : null;
    (edit ?? newButton).focus();
  }

  function showEditor(die?: DieDefinition): void {
    editingId = die?.id ?? null;
    const input = die ? toCustomDieInput(die) : null;
    formTitle.textContent = die ? `Edit ${die.name}` : 'New custom die';
    nameInput.value = input?.name ?? '';
    setFaceCount(input?.faces.length ?? DEFAULT_FACE_COUNT, input?.faces ?? []);
    look.setStyle(die?.style ?? DEFAULT_STYLE);
    clearErrors();
    listView.hidden = true;
    form.hidden = false;
    look.start();
    updatePreview();
    nameInput.focus();
  }

  function rowFor(id: string): HTMLElement | null {
    return (
      [...list.querySelectorAll<HTMLElement>('[data-die-id]')].find(
        (li) => li.dataset.dieId === id,
      ) ?? null
    );
  }

  function renderRow(li: HTMLElement, die: DieDefinition, confirming: boolean): void {
    const info = el('div', 'manager__info');
    info.append(
      el('span', 'manager__name', die.name),
      el('span', 'manager__meta', `${die.shape} · ${faceSummary(die)}`),
    );
    const actions = el('div', 'manager__actions');
    const button = (text: string, action: string, label: string, primary = false) => {
      const b = el('button', `btn btn--small${primary ? ' btn--danger' : ''}`, text);
      b.type = 'button';
      b.dataset.action = action;
      b.setAttribute('aria-label', label);
      return b;
    };
    if (confirming) {
      actions.append(
        el('span', 'manager__confirm', 'Delete this die?'),
        button('Delete', 'confirm-delete', `Yes, delete ${die.name}`, true),
        button('Keep', 'cancel-delete', `Keep ${die.name}`),
      );
    } else {
      actions.append(
        button('Edit', 'edit', `Edit ${die.name}`),
        button('Delete', 'delete', `Delete ${die.name}`),
      );
    }
    li.replaceChildren(info, actions);
  }

  function renderList(): void {
    const dice = options.getDice();
    list.replaceChildren(
      ...dice.map((die) => {
        const li = el('li', 'manager__item');
        li.dataset.dieId = die.id;
        renderRow(li, die, false);
        return li;
      }),
    );
    empty.hidden = dice.length > 0;
  }

  list.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-action]');
    const li = button?.closest<HTMLElement>('[data-die-id]');
    if (!button || !li) return;
    const id = li.dataset.dieId!;
    const die = options.getDice().find((d) => d.id === id);
    if (!die) return;
    switch (button.dataset.action) {
      case 'edit':
        showEditor(die);
        break;
      case 'delete':
        renderRow(li, die, true);
        li.querySelector<HTMLButtonElement>('[data-action="cancel-delete"]')!.focus();
        break;
      case 'cancel-delete':
        renderRow(li, die, false);
        li.querySelector<HTMLButtonElement>('[data-action="delete"]')!.focus();
        break;
      case 'confirm-delete':
        options.onDelete(id);
        showList();
        break;
    }
  });

  newButton.addEventListener('click', () => showEditor());
  q('[data-action="cancel-edit"]').addEventListener('click', () => {
    showList(editingId);
  });
  q('[data-action="close-manager"]').addEventListener('click', () => closeDialog(dialog));
  countSelect.addEventListener('change', () => {
    setFaceCount(Number(countSelect.value));
    updatePreview();
  });
  facesList.addEventListener('change', updatePreview);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    // The default look is not stored, so plain dice stay as they were.
    const style = sameStyle(look.style, DEFAULT_STYLE) ? undefined : look.style;
    const input = {
      name: nameInput.value,
      faces: faceInputs().map((i) => i.value),
      ...(style ? { style } : {}),
    };
    const otherNames = options
      .getDice()
      .filter((d) => d.id !== editingId)
      .map((d) => d.name);
    const errors = validateCustomDie(input, otherNames);
    if (errors.length > 0) {
      showErrors(errors);
      return;
    }
    const die = createCustomDie(input, { id: editingId ?? undefined, otherNames });
    options.onSave(die);
    showList(die.id);
  });

  dialog.addEventListener('close', () => {
    look.stop();
    form.hidden = true;
    listView.hidden = false;
    editingId = null;
    opener?.focus();
    opener = null;
  });

  nameInput.maxLength = MAX_NAME_LENGTH * 2; // graphemes are validated; this only stops runaway input
  setFaceCount(DEFAULT_FACE_COUNT);

  return {
    dialog,
    open() {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      renderList();
      form.hidden = true;
      listView.hidden = false;
      openDialog(dialog);
      newButton.focus();
    },
    close() {
      closeDialog(dialog);
    },
    setNotice(text) {
      notice.textContent = text;
      notice.hidden = text === '';
    },
  };
}
