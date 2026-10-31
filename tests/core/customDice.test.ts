import { describe, it, expect } from 'vitest';
import {
  ALLOWED_FACE_COUNTS,
  MAX_FACE_LENGTH,
  MAX_NAME_LENGTH,
  CustomDieValidationError,
  createCustomDie,
  graphemeLength,
  parseFace,
  toCustomDieInput,
  validateCustomDie,
} from '../../src/core/customDice';
import { isNumberDie } from '../../src/core/dice';

const combat = { name: 'Combat die', faces: ['⚔️', '⚔️', '🛡️', '🛡️', '💀', ''] };

describe('graphemeLength', () => {
  it.each([
    ['', 0],
    ['abc', 3],
    ['⚔️', 1],
    ['👨‍👩‍👧', 1],
    ['🇳🇱x', 2],
  ])('%j has %i graphemes', (s, n) => {
    expect(graphemeLength(s)).toBe(n);
  });
});

describe('parseFace', () => {
  it.each([
    ['5', { label: '5', value: 5 }],
    [' 12 ', { label: '12', value: 12 }],
    ['-1', { label: '-1', value: -1 }],
    ['0', { label: '0', value: 0 }],
    ['⚔️', { label: '⚔️', value: null }],
    ['2x', { label: '2x', value: null }],
    ['1.5', { label: '1.5', value: null }],
    ['', { label: '', value: null }],
    ['   ', { label: '', value: null }],
  ])('parses %j', (raw, face) => {
    expect(parseFace(raw)).toEqual(face);
  });
});

describe('validateCustomDie', () => {
  it('accepts a valid symbol die', () => {
    expect(validateCustomDie(combat)).toEqual([]);
  });

  it.each(ALLOWED_FACE_COUNTS)('accepts %i faces', (n) => {
    const faces = Array.from({ length: n }, (_, i) => String(i));
    expect(validateCustomDie({ name: 'X', faces })).toEqual([]);
  });

  it.each([0, 1, 5, 7, 100])('rejects %i faces', (n) => {
    const faces = Array.from({ length: n }, () => 'a');
    const errors = validateCustomDie({ name: 'X', faces });
    expect(errors).toContainEqual(expect.objectContaining({ field: 'faces' }));
    expect(errors.find((e) => e.field === 'faces')!.message).toContain(`got ${n}`);
  });

  it('requires a name', () => {
    expect(validateCustomDie({ ...combat, name: '   ' })).toEqual([
      { field: 'name', message: 'Name is required.' },
    ]);
  });

  it('limits name length', () => {
    expect(validateCustomDie({ ...combat, name: 'a'.repeat(MAX_NAME_LENGTH) })).toEqual([]);
    const errors = validateCustomDie({ ...combat, name: 'a'.repeat(MAX_NAME_LENGTH + 1) });
    expect(errors).toEqual([expect.objectContaining({ field: 'name' })]);
  });

  it('rejects duplicate names case-insensitively', () => {
    const errors = validateCustomDie({ ...combat, name: ' combat DIE ' }, ['Combat die']);
    expect(errors).toEqual([
      { field: 'name', message: 'A custom die with this name already exists.' },
    ]);
  });

  it('limits face label length and reports the face index', () => {
    const faces = [...combat.faces];
    faces[2] = 'x'.repeat(MAX_FACE_LENGTH + 1);
    expect(validateCustomDie({ ...combat, faces })).toEqual([
      expect.objectContaining({ field: 'faces', index: 2 }),
    ]);
  });

  it('counts emoji as single characters for the face limit', () => {
    const faces = [...combat.faces];
    faces[0] = '⚔️'.repeat(MAX_FACE_LENGTH);
    expect(validateCustomDie({ ...combat, faces })).toEqual([]);
  });

  it('rejects a die where every face is blank', () => {
    const errors = validateCustomDie({ name: 'Blank', faces: ['', '', '', ' '] });
    expect(errors).toEqual([
      { field: 'faces', message: 'At least one face must have a label.' },
    ]);
  });

  it('reports several problems at once', () => {
    expect(validateCustomDie({ name: '', faces: ['a'] })).toHaveLength(2);
  });
});

describe('createCustomDie', () => {
  it('creates a die with the matching shape and parsed faces', () => {
    const die = createCustomDie(combat);
    expect(die).toMatchObject({ name: 'Combat die', shape: 'd6', custom: true });
    expect(die.id).toMatch(/^custom-[0-9a-f]{16}$/);
    expect(die.faces[0]).toEqual({ label: '⚔️', value: null });
    expect(die.faces[5]).toEqual({ label: '', value: null });
    expect(isNumberDie(die)).toBe(false);
  });

  it('creates a number die from all-integer faces', () => {
    const die = createCustomDie({ name: 'Low d6', faces: ['1', '1', '2', '2', '3', '3'] });
    expect(isNumberDie(die)).toBe(true);
  });

  it('trims the name', () => {
    expect(createCustomDie({ ...combat, name: '  Spaced  ' }).name).toBe('Spaced');
  });

  it('keeps a given id (for editing)', () => {
    expect(createCustomDie(combat, { id: 'custom-keep' }).id).toBe('custom-keep');
  });

  it('picks the shape from the face count', () => {
    const faces = Array.from({ length: 20 }, (_, i) => String(i + 1));
    expect(createCustomDie({ name: 'Big', faces }).shape).toBe('d20');
  });

  it('throws a validation error with details', () => {
    try {
      createCustomDie({ name: 'Taken', faces: ['a'] }, { otherNames: ['taken'] });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(CustomDieValidationError);
      const err = e as CustomDieValidationError;
      expect(err.name).toBe('CustomDieValidationError');
      expect(err.errors).toHaveLength(2);
      expect(err.message).toContain('already exists');
    }
  });
});

describe('toCustomDieInput', () => {
  it('round-trips through createCustomDie', () => {
    const die = createCustomDie(combat);
    expect(toCustomDieInput(die)).toEqual(combat);
    expect(createCustomDie(toCustomDieInput(die), { id: die.id })).toEqual(die);
  });
});
