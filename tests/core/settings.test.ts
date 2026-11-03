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
    expect(saveSettings(s, { theme: 'light' })).toBe(true);
    expect(JSON.parse(s.getItem(SETTINGS_KEY)!)).toEqual({
      version: SETTINGS_VERSION,
      theme: 'light',
    });
    expect(loadSettings(s)).toEqual({ theme: 'light' });
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
    });
  });

  it('ignores unknown extra fields', () => {
    const raw = JSON.stringify({ version: 1, theme: 'system', future: { x: 1 } });
    expect(loadSettings(withRaw(raw))).toEqual({ theme: 'system' });
  });

  it('gives the defaults when storage is inaccessible', () => {
    expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('saveSettings', () => {
  it('returns false when storage is unavailable or full', () => {
    expect(saveSettings(throwing, { theme: 'dark' })).toBe(false);
  });
});
