import { describe, it, expect } from 'vitest';
import { VIEW, arenaForView, cameraHeight, cameraHeightForDice } from '../../src/render/table';

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
