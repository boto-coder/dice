import { SHAPES } from './dice';
import { parseStyle, type DiceStyle, type StandardDiceStyles } from './diceStyle';

/** What the user picked in the theme switch. */
export type ThemeChoice = 'dark' | 'light' | 'system';
/** The theme actually shown. */
export type Theme = 'dark' | 'light';

export const THEME_CHOICES: readonly ThemeChoice[] = ['dark', 'light', 'system'];
export const DEFAULT_THEME: ThemeChoice = 'dark';

export const SETTINGS_KEY = 'dice-roller:settings';
export const SETTINGS_VERSION = 1;

export interface Settings {
  readonly theme: ThemeChoice;
  /** Styles of the standard dice (custom dice keep theirs with the dice). */
  readonly dice: StandardDiceStyles;
}

export const DEFAULT_SETTINGS: Settings = { theme: DEFAULT_THEME, dice: {} };

/** Keeps the valid style entries of standard dice; anything else is dropped. */
function parseDiceStyles(x: unknown): StandardDiceStyles {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return {};
  const styles: Partial<Record<(typeof SHAPES)[number], DiceStyle>> = {};
  for (const shape of SHAPES) {
    const style = parseStyle((x as Record<string, unknown>)[shape]);
    if (style) styles[shape] = style;
  }
  return styles;
}

export function isThemeChoice(x: unknown): x is ThemeChoice {
  return typeof x === 'string' && (THEME_CHOICES as readonly string[]).includes(x);
}

/** The theme to show for a choice; "system" follows the device setting. */
export function resolveTheme(choice: ThemeChoice, systemPrefersDark: boolean): Theme {
  if (choice === 'system') return systemPrefersDark ? 'dark' : 'light';
  return choice;
}

/**
 * Loads saved settings. Never throws: missing, corrupt, or unknown data gives
 * the defaults, and an invalid field falls back to its default on its own.
 */
export function loadSettings(storage: Pick<Storage, 'getItem'>): Settings {
  let raw: string | null;
  try {
    raw = storage.getItem(SETTINGS_KEY);
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (raw === null) return DEFAULT_SETTINGS;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return DEFAULT_SETTINGS;
  const record = data as Record<string, unknown>;
  if (record.version !== SETTINGS_VERSION) return DEFAULT_SETTINGS;
  return {
    theme: isThemeChoice(record.theme) ? record.theme : DEFAULT_THEME,
    dice: parseDiceStyles(record.dice),
  };
}

/** Saves settings. Returns false if storage is unavailable or full. */
export function saveSettings(storage: Pick<Storage, 'setItem'>, settings: Settings): boolean {
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify({ version: SETTINGS_VERSION, ...settings }));
    return true;
  } catch {
    return false;
  }
}
