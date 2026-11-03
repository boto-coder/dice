import { describe, it, expect } from 'vitest';
import { contrast, isHexColour, luminance, mix, parseHex, toHex } from '../../src/core/colour';

describe('hex colours', () => {
  it('recognises #rrggbb only', () => {
    expect(isHexColour('#a1B2c3')).toBe(true);
    for (const x of ['#abc', 'a1b2c3', '#a1b2c3d4', '#ggggggg', '', 12, null]) {
      expect(isHexColour(x)).toBe(false);
    }
  });

  it('parses and formats', () => {
    expect(parseHex('#ff8000')).toEqual([255, 128, 0]);
    expect(toHex([255, 128, 0])).toBe('#ff8000');
    expect(toHex([300, -5, 7.6])).toBe('#ff0008');
    expect(() => parseHex('red')).toThrow(RangeError);
  });

  it('mixes two colours', () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mix('#ff0000', '#0000ff', 0.25)).toBe('#bf0040');
  });
});

describe('luminance and contrast (WCAG)', () => {
  it('has the reference luminances', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#ffffff')).toBeCloseTo(1, 10);
  });

  it('gives 21:1 for black on white, 1:1 for equal colours, in either order', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 6);
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 6);
    expect(contrast('#777777', '#777777')).toBe(1);
  });

  it('matches a known value (#767676 on white is about 4.54:1)', () => {
    expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });
});
