import { describe, it, expect } from 'vitest';
import {
  SHAPES,
  FACE_COUNT,
  CUSTOM_SHAPES,
  STANDARD_DICE,
  numberFaces,
  isNumberDie,
  shapeForFaceCount,
  findDie,
  type DieDefinition,
} from '../../src/core/dice';

const combatDie: DieDefinition = {
  id: 'c1',
  name: 'Combat die',
  shape: 'd6',
  faces: [
    { label: '⚔️', value: null },
    { label: '1', value: 1 },
    { label: '', value: null },
    { label: '2', value: 2 },
    { label: '3', value: 3 },
    { label: '4', value: 4 },
  ],
  custom: true,
};

describe('standard dice', () => {
  it('provides exactly the RPG set', () => {
    expect(STANDARD_DICE.map((d) => d.id)).toEqual([
      'd4',
      'd6',
      'd8',
      'd10',
      'd12',
      'd20',
      'd100',
    ]);
  });

  it.each(SHAPES)('%s has faces numbered 1..N', (shape) => {
    const die = findDie(shape)!;
    expect(die.shape).toBe(shape);
    expect(die.custom).toBe(false);
    expect(die.faces).toHaveLength(FACE_COUNT[shape]);
    die.faces.forEach((f, i) => {
      expect(f.value).toBe(i + 1);
      expect(f.label).toBe(String(i + 1));
    });
  });

  it('are all number dice', () => {
    expect(STANDARD_DICE.every(isNumberDie)).toBe(true);
  });
});

describe('numberFaces', () => {
  it('returns an empty list for zero', () => {
    expect(numberFaces(0)).toEqual([]);
  });
});

describe('isNumberDie', () => {
  it('is false when any face is not a number', () => {
    expect(isNumberDie(combatDie)).toBe(false);
  });
});

describe('shapeForFaceCount', () => {
  it.each(CUSTOM_SHAPES)('maps %s face count back to its shape', (shape) => {
    expect(shapeForFaceCount(FACE_COUNT[shape])).toBe(shape);
  });

  it.each([0, 1, 3, 5, 7, 100])('returns null for %i faces', (n) => {
    expect(shapeForFaceCount(n)).toBeNull();
  });
});

describe('findDie', () => {
  it('finds standard dice by id', () => {
    expect(findDie('d20')?.name).toBe('d20');
  });

  it('finds custom dice by id', () => {
    expect(findDie('c1', [combatDie])).toBe(combatDie);
  });

  it('returns undefined for unknown ids', () => {
    expect(findDie('nope', [combatDie])).toBeUndefined();
  });
});
