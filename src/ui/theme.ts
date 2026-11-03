import { resolveTheme, type Theme, type ThemeChoice } from '../core/settings';

/** Browser UI colour (status bar, title bar) per theme: the page background. */
export const THEME_COLORS: Readonly<Record<Theme, string>> = {
  dark: '#0f1216',
  light: '#f6f7f9',
};

const LABELS: Readonly<Record<ThemeChoice, string>> = {
  dark: 'Dark',
  light: 'Light',
  system: 'System',
};

/** Shows a theme: CSS variables follow `data-theme`, the browser UI follows theme-color. */
export function applyTheme(doc: Document, theme: Theme): void {
  doc.documentElement.dataset.theme = theme;
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
}

/** A radio group (one tab stop, arrow keys to choose) for the theme. */
export function themeSwitchMarkup(): string {
  const options = (Object.keys(LABELS) as ThemeChoice[])
    .map(
      (choice) =>
        `<label class="theme-switch__option"><input class="theme-switch__input" type="radio" name="theme" value="${choice}" /><span>${LABELS[choice]}</span></label>`,
    )
    .join('');
  return `<fieldset class="theme-switch"><legend class="visually-hidden">Theme</legend>${options}</fieldset>`;
}

export interface ThemeController {
  /** What the user picked. */
  readonly choice: ThemeChoice;
  /** What is shown (System resolved to Dark or Light). */
  readonly theme: Theme;
  set(choice: ThemeChoice): void;
  dispose(): void;
}

/**
 * Applies the chosen theme and, for System, follows the device setting live.
 * `onChange` runs whenever the shown theme changes (not for the initial one).
 */
export function createThemeController(
  doc: Document,
  initial: ThemeChoice,
  onChange: (theme: Theme) => void = () => {},
): ThemeController {
  const view = doc.defaultView;
  const query =
    view && typeof view.matchMedia === 'function'
      ? view.matchMedia('(prefers-color-scheme: dark)')
      : null;
  let choice = initial;
  let theme = resolveTheme(choice, query?.matches ?? true);
  applyTheme(doc, theme);

  function update(): void {
    const next = resolveTheme(choice, query?.matches ?? true);
    if (next === theme) return;
    theme = next;
    applyTheme(doc, theme);
    onChange(theme);
  }
  const onSystemChange = (): void => {
    if (choice === 'system') update();
  };
  // Very old Safari (and simple test stubs) lack addEventListener on media queries.
  const canListen = typeof query?.addEventListener === 'function';
  if (canListen) query!.addEventListener('change', onSystemChange);

  return {
    get choice() {
      return choice;
    },
    get theme() {
      return theme;
    },
    set(next) {
      choice = next;
      update();
    },
    dispose() {
      if (canListen) query!.removeEventListener('change', onSystemChange);
    },
  };
}
