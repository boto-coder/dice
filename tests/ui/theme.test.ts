// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  THEME_COLORS,
  applyTheme,
  createThemeController,
  themeSwitchMarkup,
} from '../../src/ui/theme';

/** A controllable stand-in for matchMedia('(prefers-color-scheme: dark)'). */
function fakeSystem(prefersDark: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches: prefersDark,
    addEventListener: vi.fn((_: string, fn: () => void) => listeners.add(fn)),
    removeEventListener: vi.fn((_: string, fn: () => void) => listeners.delete(fn)),
  };
  window.matchMedia = vi.fn(() => query as unknown as MediaQueryList);
  return {
    query,
    set(dark: boolean) {
      query.matches = dark;
      for (const fn of listeners) fn();
    },
  };
}

const originalMatchMedia = window.matchMedia;

function setUpMeta(): HTMLMetaElement {
  document.head.innerHTML = '<meta name="theme-color" content="#000000" />';
  return document.querySelector('meta')!;
}

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  delete document.documentElement.dataset.theme;
  document.head.innerHTML = '';
});

describe('applyTheme', () => {
  it('sets data-theme and the browser UI colour', () => {
    const meta = setUpMeta();
    applyTheme(document, 'light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(meta.content).toBe(THEME_COLORS.light);
    applyTheme(document, 'dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(meta.content).toBe(THEME_COLORS.dark);
  });

  it('works without a theme-color meta tag', () => {
    expect(() => applyTheme(document, 'dark')).not.toThrow();
  });
});

describe('themeSwitchMarkup', () => {
  it('is a labelled radio group with Dark, Light and System', () => {
    document.body.innerHTML = themeSwitchMarkup();
    expect(document.querySelector('legend')!.textContent).toBe('Theme');
    const radios = [...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(radios.map((r) => r.value)).toEqual(['dark', 'light', 'system']);
    expect(radios.map((r) => r.closest('label')!.textContent)).toEqual(['Dark', 'Light', 'System']);
    expect(new Set(radios.map((r) => r.name))).toEqual(new Set(['theme']));
  });
});

describe('createThemeController', () => {
  it('applies an explicit choice regardless of the device setting', () => {
    fakeSystem(false);
    const c = createThemeController(document, 'dark');
    expect(c.theme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('follows the device setting for System, live', () => {
    const system = fakeSystem(false);
    const onChange = vi.fn();
    const c = createThemeController(document, 'system', onChange);
    expect(c.theme).toBe('light');
    system.set(true);
    expect(c.theme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(onChange).toHaveBeenCalledWith('dark');
  });

  it('ignores device changes unless System is chosen', () => {
    const system = fakeSystem(true);
    const onChange = vi.fn();
    const c = createThemeController(document, 'light', onChange);
    system.set(false);
    system.set(true);
    expect(c.theme).toBe('light');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('switches choices and reports only real changes', () => {
    fakeSystem(true);
    const onChange = vi.fn();
    const c = createThemeController(document, 'dark', onChange);
    c.set('system'); // still dark: no change
    expect(onChange).not.toHaveBeenCalled();
    expect(c.choice).toBe('system');
    c.set('light');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('light');
  });

  it('stops listening when disposed', () => {
    const system = fakeSystem(false);
    const onChange = vi.fn();
    const c = createThemeController(document, 'system', onChange);
    c.dispose();
    expect(system.query.removeEventListener).toHaveBeenCalled();
    system.set(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('treats System as dark when the device setting is unknown', () => {
    // @ts-expect-error: simulate a browser without matchMedia
    window.matchMedia = undefined;
    expect(createThemeController(document, 'system').theme).toBe('dark');
  });

  it('copes with media queries that cannot be listened to', () => {
    window.matchMedia = vi.fn(() => ({ matches: false }) as MediaQueryList);
    const c = createThemeController(document, 'system');
    expect(c.theme).toBe('light');
    expect(() => c.dispose()).not.toThrow();
  });
});
