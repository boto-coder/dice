import { describe, it, expect } from 'vitest';
import { VIEW, arenaForView, cameraHeight } from '../../src/render/table';

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
