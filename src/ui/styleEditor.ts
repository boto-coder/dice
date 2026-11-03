import type { DieDefinition } from '../core/dice';
import {
  DEFAULT_STYLE,
  FINISHES,
  FINISH_NAMES,
  PATTERNS,
  PATTERN_NAMES,
  PRESETS,
  labelColour,
  labelWarning,
  presetFor,
  type DiceStyle,
  type Finish,
  type Pattern,
} from '../core/diceStyle';
import { el } from './views';

/** A 3D preview of one die (see render/preview.ts); injected so the UI stays testable. */
export interface StylePreview {
  show(die: DieDefinition): void;
  dispose(): void;
}

export type CreatePreview = (container: HTMLElement) => StylePreview;

export interface StyleEditorOptions {
  /** Prefix for element ids, unique per editor on the page. */
  readonly idPrefix: string;
  /** Called after every committed change, with the new style. */
  onChange(style: DiceStyle): void;
  /** Creates the 3D preview; omit (or throw) for none. */
  readonly createPreview?: CreatePreview | undefined;
}

export interface StyleEditor {
  readonly element: HTMLElement;
  readonly style: DiceStyle;
  /** Shows a style (without calling onChange). */
  setStyle(style: DiceStyle): void;
  /** The die the preview shows, without its style (the editor's style is applied). */
  setPreviewDie(die: DieDefinition): void;
  /** Starts the 3D preview (e.g. when its dialog opens). */
  start(): void;
  /** Stops the 3D preview and frees its WebGL context (e.g. when its dialog closes). */
  stop(): void;
}

/** Builds the style controls: presets, colours, pattern, finish, label colour, warning, preview. */
export function createStyleEditor(options: StyleEditorOptions): StyleEditor {
  const id = (name: string) => `${options.idPrefix}-${name}`;
  const element = el('div', 'style-editor');
  element.innerHTML = `
    <div class="style-editor__preview" aria-hidden="true"></div>
    <div class="style-editor__controls">
      <fieldset class="style-editor__presets">
        <legend class="field__label">Presets</legend>
        <div class="style-editor__preset-list">
          ${PRESETS.map(
            (p) =>
              `<button type="button" class="btn btn--small preset" data-preset="${p.id}" aria-pressed="false"><span class="preset__swatch" style="--swatch-body: ${p.style.body}; --swatch-accent: ${p.style.accent}"></span>${p.name}</button>`,
          ).join('')}
        </div>
      </fieldset>
      <div class="style-editor__grid">
        <div class="field">
          <label class="field__label" for="${id('body')}">Colour</label>
          <input class="field__colour" type="color" id="${id('body')}" />
        </div>
        <div class="field">
          <label class="field__label" for="${id('accent')}">Second colour</label>
          <input class="field__colour" type="color" id="${id('accent')}" />
        </div>
        <div class="field">
          <label class="field__label" for="${id('pattern')}">Pattern</label>
          <select class="field__input" id="${id('pattern')}">
            ${PATTERNS.map((p) => `<option value="${p}">${PATTERN_NAMES[p]}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label class="field__label" for="${id('finish')}">Finish</label>
          <select class="field__input" id="${id('finish')}">
            ${FINISHES.map((f) => `<option value="${f}">${FINISH_NAMES[f]}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label class="field__label" for="${id('label-mode')}">Numbers</label>
          <select class="field__input" id="${id('label-mode')}">
            <option value="auto">Automatic</option>
            <option value="custom">Custom colour</option>
          </select>
        </div>
        <div class="field">
          <label class="field__label" for="${id('label')}">Number colour</label>
          <input class="field__colour" type="color" id="${id('label')}" />
        </div>
      </div>
      <p class="style-editor__warning" role="status"></p>
    </div>
  `;

  const q = <T extends Element>(selector: string): T => element.querySelector<T>(selector)!;
  const previewBox = q<HTMLElement>('.style-editor__preview');
  const presetButtons = [...element.querySelectorAll<HTMLButtonElement>('[data-preset]')];
  const body = q<HTMLInputElement>(`#${id('body')}`);
  const accent = q<HTMLInputElement>(`#${id('accent')}`);
  const pattern = q<HTMLSelectElement>(`#${id('pattern')}`);
  const finish = q<HTMLSelectElement>(`#${id('finish')}`);
  const labelMode = q<HTMLSelectElement>(`#${id('label-mode')}`);
  const label = q<HTMLInputElement>(`#${id('label')}`);
  const warning = q<HTMLElement>('.style-editor__warning');

  let style: DiceStyle = DEFAULT_STYLE;
  let previewDie: DieDefinition | null = null;
  let preview: StylePreview | null = null;
  let running = false;

  function showPreview(): void {
    if (preview && previewDie) preview.show({ ...previewDie, style });
  }

  function render(): void {
    body.value = style.body;
    accent.value = style.accent;
    pattern.value = style.pattern;
    finish.value = style.finish;
    labelMode.value = style.label === 'auto' ? 'auto' : 'custom';
    label.value = labelColour(style);
    // The second colour only matters for patterns; the number colour only when chosen.
    accent.disabled = style.pattern === 'solid';
    label.disabled = style.label === 'auto';
    const preset = presetFor(style);
    for (const b of presetButtons) {
      b.setAttribute('aria-pressed', String(b.dataset.preset === preset?.id));
    }
    warning.textContent = labelWarning(style) ?? '';
    showPreview();
  }

  function commit(next: DiceStyle): void {
    style = next;
    render();
    options.onChange(style);
  }

  for (const b of presetButtons) {
    b.addEventListener('click', () => {
      const preset = PRESETS.find((p) => p.id === b.dataset.preset);
      if (preset) commit(preset.style);
    });
  }
  // Colour pickers report "change" once a colour is chosen; that is when the die is redrawn.
  body.addEventListener('change', () => commit({ ...style, body: body.value }));
  accent.addEventListener('change', () => commit({ ...style, accent: accent.value }));
  pattern.addEventListener('change', () => commit({ ...style, pattern: pattern.value as Pattern }));
  finish.addEventListener('change', () => commit({ ...style, finish: finish.value as Finish }));
  labelMode.addEventListener('change', () =>
    commit({ ...style, label: labelMode.value === 'auto' ? 'auto' : labelColour(style) }),
  );
  label.addEventListener('change', () => commit({ ...style, label: label.value }));

  render();

  return {
    element,
    get style() {
      return style;
    },
    setStyle(next) {
      style = next;
      render();
    },
    setPreviewDie(die) {
      previewDie = die;
      showPreview();
    },
    start() {
      if (running) return;
      running = true;
      if (!options.createPreview) return;
      try {
        preview = options.createPreview(previewBox);
        previewBox.classList.remove('style-editor__preview--none');
        showPreview();
      } catch {
        preview = null;
        previewBox.classList.add('style-editor__preview--none');
      }
    },
    stop() {
      running = false;
      preview?.dispose();
      preview = null;
    },
  };
}
