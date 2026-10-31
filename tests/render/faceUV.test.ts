import { describe, it, expect } from 'vitest';
import { faceUVs } from '../../src/render/faceUV';
import { faceNormal, polyhedronFor, type Vec3Tuple } from '../../src/physics/polyhedra';

function signedArea(uvs: readonly (readonly [number, number])[]): number {
  let a = 0;
  uvs.forEach(([u1, v1], i) => {
    const [u2, v2] = uvs[(i + 1) % uvs.length]!;
    a += u1 * v2 - u2 * v1;
  });
  return a / 2;
}

describe('faceUVs', () => {
  const d6 = polyhedronFor('d6');

  it.each(d6.faces.map((_, i) => i))('maps d6 face %i onto the full unit square', (i) => {
    const points = d6.faces[i]!.map((vi) => d6.vertices[vi]!);
    const uvs = faceUVs(points, faceNormal(d6, i));
    const sorted = uvs.map(([u, v]) => `${u.toFixed(6)},${v.toFixed(6)}`).sort();
    expect(sorted).toEqual([
      '0.000000,0.000000',
      '0.000000,1.000000',
      '1.000000,0.000000',
      '1.000000,1.000000',
    ]);
  });

  it('keeps counter-clockwise winding (texture not mirrored)', () => {
    d6.faces.forEach((face, i) => {
      const uvs = faceUVs(
        face.map((vi) => d6.vertices[vi]!),
        faceNormal(d6, i),
      );
      expect(signedArea(uvs)).toBeGreaterThan(0);
    });
  });

  it('centres a triangle and keeps it inside the unit square', () => {
    const tri: Vec3Tuple[] = [
      [0, 0, 0],
      [1, 0, 0],
      [0.5, Math.sqrt(3) / 2, 0],
    ];
    const uvs = faceUVs(tri, [0, 0, 1]);
    for (const [u, v] of uvs) {
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    const cu = uvs.reduce((s, [u]) => s + u, 0) / 3;
    const cv = uvs.reduce((s, [, v]) => s + v, 0) / 3;
    expect(cu).toBeCloseTo(0.5);
    expect(cv).toBeCloseTo(0.5);
    expect(signedArea(uvs)).toBeGreaterThan(0);
  });
});
