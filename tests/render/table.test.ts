import { describe, it, expect, vi } from 'vitest';
import {
  VIEW,
  arenaForView,
  cameraHeight,
  cameraHeightForDice,
  prefersReducedMotion,
  settleInstantly,
} from '../../src/render/table';
import { DiceWorld } from '../../src/physics/world';
import { seededRng } from '../../src/core/random';

describe('cameraHeight / arenaForView', () => {
  it.each([0.45, 0.75, 1, 1.6, 2.4])(
    'keeps the shorter side at least minArenaHalf for aspect %f',
    (aspect) => {
      const arena = arenaForView(aspect, cameraHeight(aspect));
      expect(Math.min(arena.halfWidth, arena.halfDepth)).toBeCloseTo(VIEW.minArenaHalf, 6);
    },
  );

  it('widens the arena on landscape screens', () => {
    const arena = arenaForView(2, cameraHeight(2));
    expect(arena.halfWidth).toBeGreaterThan(arena.halfDepth);
  });

  it('deepens the arena on portrait screens', () => {
    const arena = arenaForView(0.5, cameraHeight(0.5));
    expect(arena.halfDepth).toBeGreaterThan(arena.halfWidth);
  });

  it('raises the camera for narrow screens', () => {
    expect(cameraHeight(0.5)).toBeGreaterThan(cameraHeight(1));
    expect(cameraHeight(2)).toBeCloseTo(cameraHeight(1));
  });
});

describe('cameraHeightForDice', () => {
  it.each([0.5, 1, 1.6])('keeps the base height for a few dice (aspect %f)', (aspect) => {
    expect(cameraHeightForDice(aspect, 0)).toBeCloseTo(cameraHeight(aspect));
    expect(cameraHeightForDice(aspect, 1)).toBeCloseTo(cameraHeight(aspect));
  });

  it.each([0.5, 0.9, 1.6, 2.4])(
    'zooms out until 20 dice have enough room (aspect %f)',
    (aspect) => {
      const h = cameraHeightForDice(aspect, 20);
      expect(h).toBeGreaterThan(cameraHeight(aspect));
      const arena = arenaForView(aspect, h);
      expect(4 * arena.halfWidth * arena.halfDepth).toBeCloseTo(20 * VIEW.areaPerDie, 6);
    },
  );

  it('never lowers the camera as dice are added', () => {
    let prev = 0;
    for (let n = 0; n <= 20; n++) {
      const h = cameraHeightForDice(1.3, n);
      expect(h).toBeGreaterThanOrEqual(prev);
      prev = h;
    }
  });
});

describe('settleInstantly', () => {
  it('runs a throw to rest and reads every die', () => {
    const w = new DiceWorld({ halfWidth: 6, halfDepth: 5 });
    w.setDice(['d6', 'd20', 'd4']);
    w.throwDice(seededRng(9));
    const faces = settleInstantly(w);
    expect(faces).toHaveLength(3);
    expect(w.isSettled()).toBe(true);
    expect(faces[0]).toBeGreaterThanOrEqual(0);
    expect(faces[0]).toBeLessThan(6);
    expect(faces[1]).toBeLessThan(20);
    expect(faces[2]).toBeLessThan(4);
  });
});

describe('prefersReducedMotion', () => {
  it('is false where matchMedia is unavailable', () => {
    vi.stubGlobal('window', {});
    expect(prefersReducedMotion()).toBe(false);
    vi.unstubAllGlobals();
  });

  it('follows the prefers-reduced-motion media query', () => {
    const matchMedia = vi.fn((q: string) => ({ matches: q.includes('reduce') }));
    vi.stubGlobal('window', { matchMedia });
    expect(prefersReducedMotion()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    vi.unstubAllGlobals();
  });
});
