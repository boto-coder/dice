import { describe, it, expect } from 'vitest';
import { PATTERNS, PRESETS, type DiceStyle } from '../../src/core/diceStyle';
import { hashString, planPattern, type Cell } from '../../src/render/pattern';

const cells: Cell[] = [
  { x: 0, y: 0, size: 100 },
  { x: 100, y: 0, size: 100 },
  { x: 0, y: 100, size: 100 },
];
const style = (pattern: DiceStyle['pattern']): DiceStyle => ({
  body: '#204060',
  accent: '#a0c0e0',
  label: 'auto',
  pattern,
  finish: 'matte',
});

describe('planPattern', () => {
  it.each(PATTERNS)('%s starts by filling the body colour', (pattern) => {
    const [first] = planPattern(style(pattern), cells);
    expect(first).toEqual({ kind: 'fill', colour: '#204060' });
  });

  it('solid is only the fill', () => {
    expect(planPattern(style('solid'), cells)).toHaveLength(1);
  });

  it.each(PATTERNS.filter((p) => p !== 'solid'))(
    '%s draws in the accent colour on every face, inside that face',
    (pattern) => {
      const shapes = planPattern(style(pattern), cells).slice(1);
      expect(shapes.length).toBeGreaterThanOrEqual(cells.length);
      for (const cell of cells) {
        expect(shapes.some((s) => s.kind !== 'fill' && s.cell === cell)).toBe(true);
      }
      expect(
        shapes.some((s) =>
          s.kind === 'gradient' ? s.to === '#a0c0e0' : 'colour' in s && s.colour === '#a0c0e0',
        ),
      ).toBe(true);
    },
  );

  it('gradient runs from the body to the accent on each face', () => {
    const shapes = planPattern(style('gradient'), cells).slice(1);
    expect(shapes).toEqual(
      cells.map((cell) => ({ kind: 'gradient', cell, from: '#204060', to: '#a0c0e0' })),
    );
  });

  it('is deterministic for a style and differs between styles', () => {
    const a = planPattern(style('marble'), cells);
    expect(planPattern(style('marble'), cells)).toEqual(a);
    expect(planPattern({ ...style('marble'), body: '#204061' }, cells)).not.toEqual(a);
  });

  it('keeps shapes in sensible bounds', () => {
    for (const preset of PRESETS) {
      for (const shape of planPattern(preset.style, cells)) {
        if (shape.kind === 'dot') {
          expect(shape.r).toBeGreaterThan(0);
          expect(shape.r).toBeLessThan(shape.cell.size * 0.05);
          expect(shape.alpha).toBeGreaterThan(0);
          expect(shape.alpha).toBeLessThanOrEqual(1);
        }
        if (shape.kind === 'line') {
          expect(shape.points.length).toBeGreaterThanOrEqual(2);
          expect(shape.width).toBeGreaterThan(0);
          for (const [x, y] of shape.points) {
            expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
          }
        }
      }
    }
  });
});

describe('hashString', () => {
  it('is stable and spreads similar strings', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
    expect(hashString('')).toBeGreaterThanOrEqual(0);
  });
});
