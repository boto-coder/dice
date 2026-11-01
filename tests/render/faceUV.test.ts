import { describe, it, expect } from 'vitest';
import {
  MAX_ATLAS_SIZE,
  atlasLayout,
  atlasPixel,
  atlasUV,
  faceUVs,
  inradius,
} from '../../src/render/faceUV';
import { faceNormal, polyhedronFor, type Vec3Tuple } from '../../src/physics/polyhedra';
import { SHAPES } from '../../src/core/dice';

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

describe('faceUVs corner alignment', () => {
  it.each(SHAPES)('keeps every %s face inside its cell, centred and unmirrored', (shape) => {
    const data = polyhedronFor(shape);
    data.faces.forEach((face, i) => {
      const uvs = faceUVs(
        face.map((vi) => data.vertices[vi]!),
        faceNormal(data, i),
        data.labelAlign,
      );
      for (const [u, v] of uvs) {
        expect(u).toBeGreaterThanOrEqual(-1e-9);
        expect(u).toBeLessThanOrEqual(1 + 1e-9);
        expect(v).toBeGreaterThanOrEqual(-1e-9);
        expect(v).toBeLessThanOrEqual(1 + 1e-9);
      }
      expect(signedArea(uvs)).toBeGreaterThan(0);
      expect(inradius(uvs)).toBeGreaterThan(0.1);
    });
  });

  it('points the label up at vertex 0', () => {
    const tri: Vec3Tuple[] = [
      [0, 1, 0],
      [-1, -1, 0],
      [1, -1, 0],
    ];
    const [top] = faceUVs(tri, [0, 0, 1], 'corner');
    expect(top![0]).toBeCloseTo(0.5);
    expect(top![1]).toBeCloseTo(1);
  });
});

describe('inradius', () => {
  it('is half the side for the full unit square', () => {
    expect(
      inradius([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ]),
    ).toBeCloseTo(0.5);
  });
});

describe('atlas layout', () => {
  it.each([
    [4, 2, 2],
    [6, 3, 2],
    [20, 5, 4],
    [100, 10, 10],
  ])('fits %i faces in a %ix%i grid', (count, columns, rows) => {
    const layout = atlasLayout(count);
    expect(layout.columns).toBe(columns);
    expect(layout.rows).toBe(rows);
    expect(layout.columns * layout.rows).toBeGreaterThanOrEqual(count);
    expect(layout.columns * layout.cell).toBeLessThanOrEqual(MAX_ATLAS_SIZE);
  });

  it('maps cell corners and keeps cells apart by the padding', () => {
    const layout = atlasLayout(4); // 2x2, 256px cells
    expect(atlasUV(layout, 0, [0, 1])).toEqual([layout.pad / 2, 1 - layout.pad / 2]);
    expect(atlasUV(layout, 3, [1, 0])[0]).toBeCloseTo(1 - layout.pad / 2);
    expect(atlasUV(layout, 3, [1, 0])[1]).toBeCloseTo(layout.pad / 2);
    expect(atlasUV(layout, 0, [1, 0.5])[0]).toBeLessThan(atlasUV(layout, 1, [0, 0.5])[0]);
  });

  it('puts the same point at matching canvas pixels (y down)', () => {
    const layout = atlasLayout(4);
    const [u, v] = atlasUV(layout, 1, [0.25, 0.75]);
    const [x, y] = atlasPixel(layout, 1, [0.25, 0.75]);
    const size = layout.columns * layout.cell;
    expect(x / size).toBeCloseTo(u);
    expect(y / size).toBeCloseTo(1 - v);
  });
});
