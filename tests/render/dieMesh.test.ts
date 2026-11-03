import { describe, it, expect } from 'vitest';
import { luminance } from '../../src/core/colour';
import { PRESETS, type DiceStyle } from '../../src/core/diceStyle';
import { FINISH_LOOK, edgeColour } from '../../src/render/dieMesh';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const solid = (body: string): DiceStyle => ({
  body,
  accent: '#000000',
  label: 'auto',
  pattern: 'solid',
  finish: 'matte',
});

describe('edgeColour', () => {
  it('is darker than light dice and lighter than dark dice', () => {
    for (const p of PRESETS) {
      const edge = luminance(hex(edgeColour(p.style)));
      const body = luminance(p.style.body);
      if (body > 0.35) expect(edge).toBeLessThan(body);
      else expect(edge).toBeGreaterThan(body);
    }
  });

  it('is subtler on the d100 ball, whose many edges would otherwise dominate', () => {
    const style = solid('#fbfbf8');
    const plain = luminance(hex(edgeColour(style)));
    const ball = luminance(hex(edgeColour(style, true)));
    expect(ball).toBeGreaterThan(plain);
  });
});

describe('FINISH_LOOK', () => {
  it('makes matte dice ignore reflections and metallic dice metallic', () => {
    expect(FINISH_LOOK.matte.env).toBe(0);
    expect(FINISH_LOOK.matte.metalness).toBe(0);
    expect(FINISH_LOOK.glossy.roughness).toBeLessThan(FINISH_LOOK.matte.roughness);
    expect(FINISH_LOOK.metallic.metalness).toBeGreaterThan(0.5);
  });
});
