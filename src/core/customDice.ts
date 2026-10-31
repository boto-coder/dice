import { CUSTOM_SHAPES, FACE_COUNT, shapeForFaceCount, type DieDefinition, type Face } from './dice';
import { randomId } from './random';

export const MAX_NAME_LENGTH = 30;
/** Max visible characters (grapheme clusters, so 1 emoji = 1) on a face, to keep it legible. */
export const MAX_FACE_LENGTH = 6;
export const ALLOWED_FACE_COUNTS: readonly number[] = CUSTOM_SHAPES.map((s) => FACE_COUNT[s]);

export interface CustomDieInput {
  readonly name: string;
  /** Face labels. An empty string is a blank face. */
  readonly faces: readonly string[];
}

export interface ValidationError {
  readonly field: 'name' | 'faces';
  /** Index of the offending face, when the error concerns a single face. */
  readonly index?: number;
  readonly message: string;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Number of user-perceived characters in a string. */
export function graphemeLength(s: string): number {
  let n = 0;
  for (const _ of segmenter.segment(s)) n++;
  return n;
}

/** Turns a raw face label into a Face; integer labels become number faces. */
export function parseFace(raw: string): Face {
  const label = raw.trim();
  return { label, value: /^-?\d+$/.test(label) ? Number(label) : null };
}

/**
 * Validates a custom die. `otherNames` are names already taken by other custom
 * dice (compared case-insensitively) so names stay unique.
 */
export function validateCustomDie(
  input: CustomDieInput,
  otherNames: readonly string[] = [],
): ValidationError[] {
  const errors: ValidationError[] = [];
  const name = input.name.trim();

  if (name === '') {
    errors.push({ field: 'name', message: 'Name is required.' });
  } else if (graphemeLength(name) > MAX_NAME_LENGTH) {
    errors.push({ field: 'name', message: `Name must be at most ${MAX_NAME_LENGTH} characters.` });
  } else if (otherNames.some((n) => n.trim().toLowerCase() === name.toLowerCase())) {
    errors.push({ field: 'name', message: 'A custom die with this name already exists.' });
  }

  if (shapeForFaceCount(input.faces.length) === null) {
    errors.push({
      field: 'faces',
      message: `A die must have ${ALLOWED_FACE_COUNTS.join(', ')} faces (got ${input.faces.length}).`,
    });
  }

  input.faces.forEach((raw, index) => {
    if (graphemeLength(raw.trim()) > MAX_FACE_LENGTH) {
      errors.push({
        field: 'faces',
        index,
        message: `Face ${index + 1} must be at most ${MAX_FACE_LENGTH} characters.`,
      });
    }
  });

  if (input.faces.length > 0 && input.faces.every((f) => f.trim() === '')) {
    errors.push({ field: 'faces', message: 'At least one face must have a label.' });
  }

  return errors;
}

export class CustomDieValidationError extends Error {
  constructor(readonly errors: readonly ValidationError[]) {
    super(errors.map((e) => e.message).join(' '));
    this.name = 'CustomDieValidationError';
  }
}

/** Creates a custom die, or throws CustomDieValidationError. Pass `id` to update an existing die. */
export function createCustomDie(
  input: CustomDieInput,
  options: { id?: string; otherNames?: readonly string[] } = {},
): DieDefinition {
  const errors = validateCustomDie(input, options.otherNames);
  if (errors.length > 0) throw new CustomDieValidationError(errors);
  return {
    id: options.id ?? `custom-${randomId()}`,
    name: input.name.trim(),
    shape: shapeForFaceCount(input.faces.length)!,
    faces: input.faces.map(parseFace),
    custom: true,
  };
}

/** Converts a die back into editable input (e.g. to prefill the editor). */
export function toCustomDieInput(die: DieDefinition): CustomDieInput {
  return { name: die.name, faces: die.faces.map((f) => f.label) };
}
