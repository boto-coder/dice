import { contrast, isHexColour, mix } from './colour';
import type { DieDefinition, DieShape } from './dice';

export const PATTERNS = ['solid', 'marble', 'speckled', 'swirl', 'stripes', 'gradient'] as const;
export type Pattern = (typeof PATTERNS)[number];

export const FINISHES = ['matte', 'glossy', 'metallic'] as const;
export type Finish = (typeof FINISHES)[number];

export const PATTERN_NAMES: Readonly<Record<Pattern, string>> = {
  solid: 'Solid',
  marble: 'Marble',
  speckled: 'Speckled',
  swirl: 'Two-colour swirl',
  stripes: 'Stripes',
  gradient: 'Gradient',
};

export const FINISH_NAMES: Readonly<Record<Finish, string>> = {
  matte: 'Matte',
  glossy: 'Glossy',
  metallic: 'Metallic',
};

/** How a die looks. Purely visual: it never affects results. */
export interface DiceStyle {
  /** Main colour of the die. */
  readonly body: string;
  /** Second colour, used by every pattern except solid. */
  readonly accent: string;
  /** Colour of the numbers and symbols, or 'auto' for the most readable of dark/light. */
  readonly label: string | 'auto';
  readonly pattern: Pattern;
  readonly finish: Finish;
}

export const DARK_INK = '#1f2328';
export const LIGHT_INK = '#f5f5f0';

/** Labels are large text, so 3:1 (WCAG AA for large text) is the minimum. */
export const READABLE_CONTRAST = 3;

export interface Preset {
  readonly id: string;
  readonly name: string;
  readonly style: DiceStyle;
}

export const PRESETS: readonly Preset[] = [
  {
    id: 'ivory',
    name: 'Ivory',
    style: { body: '#fbfbf8', accent: '#d9d6cc', label: 'auto', pattern: 'solid', finish: 'matte' },
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    style: {
      body: '#17171c',
      accent: '#4a4a5c',
      label: 'auto',
      pattern: 'marble',
      finish: 'glossy',
    },
  },
  {
    id: 'ruby',
    name: 'Ruby marble',
    style: {
      body: '#8e1428',
      accent: '#e07a8c',
      label: 'auto',
      pattern: 'marble',
      finish: 'glossy',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean speckle',
    style: {
      body: '#0b4f6c',
      accent: '#8fdcf5',
      label: 'auto',
      pattern: 'speckled',
      finish: 'matte',
    },
  },
  {
    id: 'gold',
    name: 'Gold',
    style: {
      body: '#d4a73a',
      accent: '#fff0b3',
      label: 'auto',
      pattern: 'gradient',
      finish: 'metallic',
    },
  },
  {
    id: 'forest',
    name: 'Forest swirl',
    style: {
      body: '#1e5e3f',
      accent: '#2f8a5c',
      label: 'auto',
      pattern: 'swirl',
      finish: 'glossy',
    },
  },
  {
    id: 'amethyst',
    name: 'Amethyst stripes',
    style: {
      body: '#4b2a85',
      accent: '#7a52c0',
      label: 'auto',
      pattern: 'stripes',
      finish: 'glossy',
    },
  },
];

export const DEFAULT_STYLE: DiceStyle = PRESETS[0]!.style;

/**
 * The colours a label can end up on: the body, plus the accent where the
 * pattern puts large areas of it behind the labels (thin veins and specks
 * count as a light tint of the body).
 */
export function surfaceColours(style: DiceStyle): string[] {
  switch (style.pattern) {
    case 'solid':
      return [style.body];
    case 'marble':
    case 'speckled':
      return [style.body, mix(style.body, style.accent, 0.35)];
    default:
      return [style.body, style.accent];
  }
}

/** Lowest contrast of `ink` against any surface of the style. */
export function inkContrast(style: DiceStyle, ink: string): number {
  return Math.min(...surfaceColours(style).map((s) => contrast(ink, s)));
}

/** The label colour actually drawn: the chosen one, or the more readable of dark and light ink. */
export function labelColour(style: DiceStyle): string {
  if (style.label !== 'auto') return style.label;
  return inkContrast(style, DARK_INK) >= inkContrast(style, LIGHT_INK) ? DARK_INK : LIGHT_INK;
}

/** A warning when the labels would be hard to read, else null. */
export function labelWarning(style: DiceStyle): string | null {
  const ratio = inkContrast(style, labelColour(style));
  if (ratio >= READABLE_CONTRAST) return null;
  return `The numbers may be hard to read (contrast ${ratio.toFixed(1)}:1; at least ${READABLE_CONTRAST}:1 is recommended).`;
}

/** A stable key for caching textures and materials per style. */
export function styleKey(style: DiceStyle): string {
  return [style.body, style.accent, style.label, style.pattern, style.finish]
    .join('|')
    .toLowerCase();
}

export function sameStyle(a: DiceStyle, b: DiceStyle): boolean {
  return styleKey(a) === styleKey(b);
}

/** The preset a style matches exactly, if any. */
export function presetFor(style: DiceStyle): Preset | undefined {
  return PRESETS.find((p) => sameStyle(p.style, style));
}

/** Validates stored data as a style; null if anything is missing or invalid. */
export function parseStyle(x: unknown): DiceStyle | null {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return null;
  const r = x as Record<string, unknown>;
  if (!isHexColour(r.body) || !isHexColour(r.accent)) return null;
  if (r.label !== 'auto' && !isHexColour(r.label)) return null;
  if (!(PATTERNS as readonly unknown[]).includes(r.pattern)) return null;
  if (!(FINISHES as readonly unknown[]).includes(r.finish)) return null;
  return {
    body: r.body.toLowerCase(),
    accent: r.accent.toLowerCase(),
    label: r.label === 'auto' ? 'auto' : (r.label as string).toLowerCase(),
    pattern: r.pattern as Pattern,
    finish: r.finish as Finish,
  };
}

/** Styles chosen for the standard dice, by die id (d4 … d100). Missing means the default. */
export type StandardDiceStyles = Readonly<Partial<Record<DieShape, DiceStyle>>>;

/** The style a die is drawn with. */
export function styleOf(die: DieDefinition, standard: StandardDiceStyles): DiceStyle {
  if (die.custom) return die.style ?? DEFAULT_STYLE;
  return standard[die.id as DieShape] ?? DEFAULT_STYLE;
}
