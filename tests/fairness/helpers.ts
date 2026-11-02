import { STANDARD_DICE, findDie, type DieDefinition } from '../../src/core/dice';
import { createCustomDie } from '../../src/core/customDice';
import { arenaForView, cameraHeightForDice } from '../../src/render/table';
import type { Arena } from '../../src/physics/world';

/** Significance level: a fair die fails a single test 1% of the time. */
export const ALPHA = 0.01;

/** The arena a 16:9 desktop table would use for this many dice. */
export function arenaFor(count: number, aspect = 16 / 9): Arena {
  return arenaForView(aspect, cameraHeightForDice(aspect, count));
}

export const die = (id: string): DieDefinition => findDie(id)!;
export { STANDARD_DICE };

/** A symbol die with a repeated face and a blank face (board-game style). */
export const COMBAT = createCustomDie(
  { name: 'Combat', faces: ['⚔️', '⚔️', '🛡️', '🛡️', '💀', ''] },
  { id: 'custom-combat' },
);

/** A d4-shaped custom die (read by its top corner) with uneven numbers. */
export const PIPS = createCustomDie(
  { name: 'Pips', faces: ['1', '1', '2', '3'] },
  { id: 'custom-pips' },
);
