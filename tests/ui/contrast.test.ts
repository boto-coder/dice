import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/** The custom properties of one theme block in style.css. */
function palette(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`No ${selector} block`);
  const block = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1]!, m[2]!]),
  );
}

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const css = readFileSync(new URL('../../src/style.css', import.meta.url), 'utf8');
const themes = {
  dark: palette(css, ":root[data-theme='dark']"),
  light: palette(css, ":root[data-theme='light']"),
};

/** Text colour on background colour, as they are used in style.css. */
const PAIRS: readonly [string, string][] = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['text', 'surface-hover'],
  ['text', 'dialog-bg'],
  ['text', 'notice-bg'],
  ['muted', 'bg'],
  ['muted', 'surface'],
  ['muted', 'dialog-bg'],
  ['muted', 'table-bg'],
  ['primary-text', 'primary-bg'],
  ['primary-text', 'primary-hover'],
  ['danger-text', 'danger-bg'],
  ['danger-text', 'danger-hover'],
  ['success-text', 'success-bg'],
  ['success-text', 'surface'],
  ['failure-text', 'failure-bg'],
  ['failure-text', 'surface'],
  ['failure-text', 'dialog-bg'],
];

describe.each(Object.entries(themes))('%s theme', (_, colours) => {
  it('defines every colour the light theme does', () => {
    expect(Object.keys(colours).sort()).toEqual(Object.keys(themes.light).sort());
  });

  it.each(PAIRS)('%s on %s has at least 4.5:1 contrast', (fg, bg) => {
    expect(colours[fg], fg).toBeDefined();
    expect(colours[bg], bg).toBeDefined();
    expect(contrast(colours[fg]!, colours[bg]!)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the focus ring visible (3:1) against the page and surfaces', () => {
    for (const bg of ['bg', 'surface', 'dialog-bg']) {
      expect(contrast(colours.focus!, colours[bg]!), bg).toBeGreaterThanOrEqual(3);
    }
  });
});
