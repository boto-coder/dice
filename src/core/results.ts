import { isNumberDie, type DieDefinition, type DieShape, type Face } from './dice';

export type Crit = 'success' | 'failure' | null;

export interface DieResult {
  readonly dieId: string;
  readonly name: string;
  readonly shape: DieShape;
  readonly faceIndex: number;
  readonly face: Face;
  /** Whether this die's value counts toward the roll total. */
  readonly counted: boolean;
  readonly crit: Crit;
}

export interface RollResult {
  readonly dice: readonly DieResult[];
  /** Sum of all number dice, or null if the roll contains no number dice. */
  readonly total: number | null;
}

export interface RolledDie {
  readonly die: DieDefinition;
  readonly faceIndex: number;
}

/** Natural 20 / natural 1 on the standard d20 only. */
export function critFor(die: DieDefinition, face: Face): Crit {
  if (die.custom || die.shape !== 'd20') return null;
  if (face.value === 20) return 'success';
  if (face.value === 1) return 'failure';
  return null;
}

export function dieResult({ die, faceIndex }: RolledDie): DieResult {
  const face = die.faces[faceIndex];
  if (!Number.isInteger(faceIndex) || face === undefined) {
    throw new RangeError(`Face index ${faceIndex} out of range for ${die.name}`);
  }
  return {
    dieId: die.id,
    name: die.name,
    shape: die.shape,
    faceIndex,
    face,
    counted: isNumberDie(die),
    crit: critFor(die, face),
  };
}

export function buildRollResult(rolled: readonly RolledDie[]): RollResult {
  const dice = rolled.map(dieResult);
  const counted = dice.filter((d) => d.counted);
  const total = counted.length > 0 ? counted.reduce((sum, d) => sum + d.face.value!, 0) : null;
  return { dice, total };
}

function faceText(face: Face): string {
  return face.label === '' ? 'blank' : face.label;
}

/** Plain-text description for screen readers and history, e.g. "d20: 20 (critical success). Total: 20." */
export function describeRoll(result: RollResult): string {
  if (result.dice.length === 0) return 'No dice rolled.';
  const parts = result.dice.map((d) => {
    const crit = d.crit ? ` (critical ${d.crit})` : '';
    return `${d.name}: ${faceText(d.face)}${crit}`;
  });
  const total = result.total !== null ? ` Total: ${result.total}.` : '';
  return `${parts.join(', ')}.${total}`;
}
