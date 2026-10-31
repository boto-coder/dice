import { describe, it, expect } from 'vitest';
import {
  DIE_SIZE,
  faceCenter,
  faceNormal,
  faceNormals,
  normalize,
  polyhedronFor,
} from '../../src/physics/polyhedra';
import { findDie } from '../../src/core/dice';

const dot = (a: readonly number[], b: readonly number[]) => a.reduce((s, x, i) => s + x * b[i]!, 0);

describe('d6 polyhedron', () => {
  const d6 = polyhedronFor('d6');

  it('has 8 vertices and 6 quad faces', () => {
    expect(d6.vertices).toHaveLength(8);
    expect(d6.faces).toHaveLength(6);
    for (const f of d6.faces) expect(f).toHaveLength(4);
  });

  it('matches the number of faces on the standard d6', () => {
    expect(d6.faces).toHaveLength(findDie('d6')!.faces.length);
  });

  it('has edge length DIE_SIZE', () => {
    const [a, b] = [d6.vertices[0]!, d6.vertices[1]!];
    expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeCloseTo(DIE_SIZE);
  });

  it('uses every vertex', () => {
    expect(new Set(d6.faces.flat()).size).toBe(8);
  });

  it('has unit normals pointing outward (counter-clockwise winding)', () => {
    d6.faces.forEach((_, i) => {
      const n = faceNormal(d6, i);
      expect(Math.hypot(...n)).toBeCloseTo(1);
      expect(dot(n, faceCenter(d6, i))).toBeGreaterThan(0);
    });
  });

  it('has planar faces', () => {
    d6.faces.forEach((face, i) => {
      const n = faceNormal(d6, i);
      const c = faceCenter(d6, i);
      for (const vi of face) {
        const v = d6.vertices[vi]!;
        expect(dot(n, [v[0] - c[0], v[1] - c[1], v[2] - c[2]])).toBeCloseTo(0);
      }
    });
  });

  it('puts opposite faces so their values sum to 7', () => {
    const values = findDie('d6')!.faces.map((f) => f.value!);
    const normals = faceNormals(d6);
    normals.forEach((n, i) => {
      const opposite = normals.findIndex((m) => dot(n, m) < -0.999);
      expect(values[i]! + values[opposite]!).toBe(7);
    });
  });
});

describe('polyhedronFor', () => {
  it('throws for shapes not built yet', () => {
    expect(() => polyhedronFor('d100')).toThrow(/No geometry/);
  });
});

describe('normalize', () => {
  it('scales a vector to unit length', () => {
    expect(normalize([3, 0, 4])).toEqual([0.6, 0, 0.8]);
  });
});
