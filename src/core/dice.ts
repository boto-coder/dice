export const SHAPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'] as const;
export type DieShape = (typeof SHAPES)[number];

export const FACE_COUNT: Readonly<Record<DieShape, number>> = {
  d4: 4,
  d6: 6,
  d8: 8,
  d10: 10,
  d12: 12,
  d20: 20,
  d100: 100,
};

/** Shapes a custom die may use (the d100 ball is reserved for the standard die). */
export const CUSTOM_SHAPES = [
  'd4',
  'd6',
  'd8',
  'd10',
  'd12',
  'd20',
] as const satisfies readonly DieShape[];
export type CustomDieShape = (typeof CUSTOM_SHAPES)[number];

/** One face of a die. `value` is set when the label is an integer, else null (symbol/text/blank). */
export interface Face {
  readonly label: string;
  readonly value: number | null;
}

export interface DieDefinition {
  readonly id: string;
  readonly name: string;
  readonly shape: DieShape;
  readonly faces: readonly Face[];
  readonly custom: boolean;
}

export function numberFaces(count: number): Face[] {
  return Array.from({ length: count }, (_, i) => ({ label: String(i + 1), value: i + 1 }));
}

export const STANDARD_DICE: readonly DieDefinition[] = SHAPES.map((shape) => ({
  id: shape,
  name: shape,
  shape,
  faces: numberFaces(FACE_COUNT[shape]),
  custom: false,
}));

/** A die counts toward the sum only if every face is a number. */
export function isNumberDie(die: DieDefinition): boolean {
  return die.faces.every((f) => f.value !== null);
}

/** The custom shape with exactly `count` faces, or null if no standard shape matches. */
export function shapeForFaceCount(count: number): CustomDieShape | null {
  return CUSTOM_SHAPES.find((s) => FACE_COUNT[s] === count) ?? null;
}

/** Finds a die by id among the standard dice and the given custom dice. */
export function findDie(
  id: string,
  customDice: readonly DieDefinition[] = [],
): DieDefinition | undefined {
  return STANDARD_DICE.find((d) => d.id === id) ?? customDice.find((d) => d.id === id);
}
