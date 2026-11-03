import { describe, it, expect } from 'vitest';
import { contrast } from '../../src/core/colour';
import { findDie } from '../../src/core/dice';
import { createCustomDie } from '../../src/core/customDice';
import {
  DARK_INK,
  DEFAULT_STYLE,
  FINISHES,
  LIGHT_INK,
  PATTERNS,
  PATTERN_NAMES,
  PRESETS,
  READABLE_CONTRAST,
  inkContrast,
  labelColour,
  labelWarning,
  parseStyle,
  presetFor,
  sameStyle,
  styleKey,
  styleOf,
  surfaceColours,
  type DiceStyle,
} from '../../src/core/diceStyle';

const plain = (body: string, extra: Partial<DiceStyle> = {}): DiceStyle => ({
  body,
  accent: '#808080',
  label: 'auto',
  pattern: 'solid',
  finish: 'matte',
  ...extra,
});

describe('patterns and finishes', () => {
  it('offers the six agreed patterns and three finishes', () => {
    expect(PATTERNS).toEqual(['solid', 'marble', 'speckled', 'swirl', 'stripes', 'gradient']);
    expect(FINISHES).toEqual(['matte', 'glossy', 'metallic']);
    expect(Object.keys(PATTERN_NAMES)).toEqual([...PATTERNS]);
  });
});

describe('presets', () => {
  it('start with Ivory, the original look, as the default', () => {
    expect(PRESETS[0]!.name).toBe('Ivory');
    expect(DEFAULT_STYLE).toBe(PRESETS[0]!.style);
    expect(labelColour(DEFAULT_STYLE)).toBe(DARK_INK);
  });

  it('have unique ids and names and valid styles', () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
    expect(new Set(PRESETS.map((p) => p.name)).size).toBe(PRESETS.length);
    for (const p of PRESETS) expect(parseStyle(p.style)).toEqual(p.style);
  });

  it('cover every pattern and finish', () => {
    expect(new Set(PRESETS.map((p) => p.style.pattern))).toEqual(new Set(PATTERNS));
    expect(new Set(PRESETS.map((p) => p.style.finish))).toEqual(new Set(FINISHES));
  });

  it.each(PRESETS.map((p) => [p.name, p.style] as const))('%s is readable', (_, style) => {
    expect(labelWarning(style)).toBeNull();
    expect(inkContrast(style, labelColour(style))).toBeGreaterThanOrEqual(READABLE_CONTRAST);
  });

  it('are found back from their styles', () => {
    for (const p of PRESETS) expect(presetFor({ ...p.style })).toBe(p);
    expect(presetFor(plain('#123456'))).toBeUndefined();
  });
});

describe('label colour', () => {
  it('picks dark ink on light dice and light ink on dark dice', () => {
    expect(labelColour(plain('#ffffff'))).toBe(DARK_INK);
    expect(labelColour(plain('#f0e060'))).toBe(DARK_INK);
    expect(labelColour(plain('#000000'))).toBe(LIGHT_INK);
    expect(labelColour(plain('#1a237e'))).toBe(LIGHT_INK);
  });

  it('keeps a chosen colour', () => {
    expect(labelColour(plain('#000000', { label: '#ff0000' }))).toBe('#ff0000');
  });

  it('considers large accent areas for two-colour patterns', () => {
    // Dark stripes on white: no ink is great, but the pick must beat the other one.
    const style = plain('#ffffff', { pattern: 'stripes', accent: '#202020' });
    expect(surfaceColours(style)).toEqual(['#ffffff', '#202020']);
    const pick = labelColour(style);
    const other = pick === DARK_INK ? LIGHT_INK : DARK_INK;
    expect(inkContrast(style, pick)).toBeGreaterThanOrEqual(inkContrast(style, other));
  });

  it('treats marble veins and specks as a tint of the body', () => {
    const [body, tint] = surfaceColours(plain('#000000', { pattern: 'marble', accent: '#ffffff' }));
    expect(body).toBe('#000000');
    expect(contrast(tint!, '#000000')).toBeGreaterThan(1);
    expect(contrast(tint!, '#ffffff')).toBeGreaterThan(1);
  });
});

describe('labelWarning', () => {
  it('warns when a chosen label colour is hard to read', () => {
    const warning = labelWarning(plain('#808080', { label: '#8a8a8a' }));
    expect(warning).toMatch(/hard to read/);
    expect(warning).toMatch(/1\.\d:1/);
  });

  it('warns when even the best ink is weak on a two-colour pattern', () => {
    expect(labelWarning(plain('#000000', { pattern: 'stripes', accent: '#ffffff' }))).toMatch(
      /hard to read/,
    );
  });

  it('is silent for a readable style', () => {
    expect(labelWarning(plain('#ffffff', { label: '#000000' }))).toBeNull();
  });
});

describe('styleKey / sameStyle', () => {
  it('ignores letter case and tells different styles apart', () => {
    const a = plain('#ABCDEF');
    expect(sameStyle(a, plain('#abcdef'))).toBe(true);
    expect(styleKey(a)).not.toBe(styleKey(plain('#abcdef', { finish: 'glossy' })));
  });
});

describe('parseStyle', () => {
  it('accepts valid styles and normalises case', () => {
    expect(parseStyle({ ...plain('#ABCDEF'), label: '#FF0000' })).toEqual({
      ...plain('#abcdef'),
      label: '#ff0000',
    });
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'ivory'],
    ['a bad body', { ...plain('#fff') }],
    ['a missing accent', { ...plain('#ffffff'), accent: undefined }],
    ['a bad label', { ...plain('#ffffff'), label: 'black' }],
    ['an unknown pattern', { ...plain('#ffffff'), pattern: 'plaid' }],
    ['an unknown finish', { ...plain('#ffffff'), finish: 'velvet' }],
  ])('rejects %s', (_, x) => {
    expect(parseStyle(x)).toBeNull();
  });
});

describe('styleOf', () => {
  const gold = PRESETS.find((p) => p.id === 'gold')!.style;
  const ocean = PRESETS.find((p) => p.id === 'ocean')!.style;

  it('uses the chosen style of a standard die, else the default', () => {
    expect(styleOf(findDie('d20')!, { d20: gold })).toBe(gold);
    expect(styleOf(findDie('d6')!, { d20: gold })).toBe(DEFAULT_STYLE);
  });

  it("uses a custom die's own style, never the standard ones", () => {
    const plainDie = createCustomDie({ name: 'A', faces: ['1', '2', '3', '4'] });
    const styledDie = createCustomDie({ name: 'B', faces: ['1', '2', '3', '4'], style: ocean });
    expect(styleOf(plainDie, { d4: gold })).toBe(DEFAULT_STYLE);
    expect(styleOf(styledDie, { d4: gold })).toBe(ocean);
  });
});
