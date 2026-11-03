import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  SETTINGS_VERSION,
  isThemeChoice,
  loadSettings,
  resolveTheme,
  saveSettings,
} from '../../src/core/settings';
import { PRESETS } from '../../src/core/diceStyle';

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

const throwing = {
  getItem(): string | null {
    throw new Error('SecurityError');
  },
  setItem(): void {
    throw new Error('QuotaExceededError');
  },
};

function withRaw(raw: string): MemoryStorage {
  const s = new MemoryStorage();
  s.setItem(SETTINGS_KEY, raw);
  return s;
}

describe('theme choices', () => {
  it('defaults to dark', () => {
    expect(DEFAULT_SETTINGS.theme).toBe('dark');
  });

  it('recognises the three choices only', () => {
    expect(['dark', 'light', 'system'].every(isThemeChoice)).toBe(true);
    expect(isThemeChoice('blue')).toBe(false);
    expect(isThemeChoice(undefined)).toBe(false);
    expect(isThemeChoice(1)).toBe(false);
  });

  it('resolves "system" from the device setting and keeps explicit choices', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });
});

describe('loadSettings', () => {
  it('gives the defaults when nothing is saved', () => {
    expect(loadSettings(new MemoryStorage())).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips through saveSettings', () => {
    const s = new MemoryStorage();
    expect(saveSettings(s, { theme: 'light', dice: {} })).toBe(true);
    expect(JSON.parse(s.getItem(SETTINGS_KEY)!)).toEqual({
      version: SETTINGS_VERSION,
      theme: 'light',
      dice: {},
    });
    expect(loadSettings(s)).toEqual({ theme: 'light', dice: {} });
  });

  it.each([
    ['corrupt JSON', '{not json'],
    ['a non-object', '"dark"'],
    ['an array', '[]'],
    ['null', 'null'],
    ['an unknown version', JSON.stringify({ version: 99, theme: 'light' })],
    ['a missing version', JSON.stringify({ theme: 'light' })],
  ])('gives the defaults for %s', (_, raw) => {
    expect(loadSettings(withRaw(raw))).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back to the default theme for an invalid theme value', () => {
    expect(loadSettings(withRaw(JSON.stringify({ version: 1, theme: 'neon' })))).toEqual({
      theme: 'dark',
      dice: {},
    });
  });

  it('ignores unknown extra fields', () => {
    const raw = JSON.stringify({ version: 1, theme: 'system', future: { x: 1 } });
    expect(loadSettings(withRaw(raw))).toEqual({ theme: 'system', dice: {} });
  });

  it('gives the defaults when storage is inaccessible', () => {
    expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('saveSettings', () => {
  it('returns false when storage is unavailable or full', () => {
    expect(saveSettings(throwing, DEFAULT_SETTINGS)).toBe(false);
  });
});

describe('standard dice styles', () => {
  const gold = PRESETS.find((p) => p.id === 'gold')!.style;
  const ocean = PRESETS.find((p) => p.id === 'ocean')!.style;

  it('round-trips a style per standard die', () => {
    const s = new MemoryStorage();
    saveSettings(s, { theme: 'dark', dice: { d20: gold, d6: ocean } });
    expect(loadSettings(s)).toEqual({ theme: 'dark', dice: { d20: gold, d6: ocean } });
  });

  it('drops invalid styles and unknown dice, keeping the rest', () => {
    const raw = JSON.stringify({
      version: 1,
      theme: 'light',
      dice: { d20: gold, d6: { body: 'blue' }, d7: gold, custom: ocean },
    });
    expect(loadSettings(withRaw(raw))).toEqual({ theme: 'light', dice: { d20: gold } });
  });

  it('ignores a malformed dice field', () => {
    for (const dice of ['gold', [gold], null]) {
      const raw = JSON.stringify({ version: 1, theme: 'dark', dice });
      expect(loadSettings(withRaw(raw))).toEqual({ theme: 'dark', dice: {} });
    }
  });

  it('reads settings saved before dice styles existed', () => {
    const raw = JSON.stringify({ version: 1, theme: 'light' });
    expect(loadSettings(withRaw(raw))).toEqual({ theme: 'light', dice: {} });
  });
});
