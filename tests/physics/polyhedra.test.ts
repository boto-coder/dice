import { describe, it, expect } from 'vitest';
import {
  SHAPE_RADIUS,
  convexFaces,
  dot,
  faceCenter,
  faceNormal,
  faceNormals,
  fibonacciSphere,
  normalize,
  polyhedronFor,
  readVectors,
  resultCount,
  sub,
  type Vec3Tuple,
} from '../../src/physics/polyhedra';
import { FACE_COUNT, SHAPES, findDie, type DieShape } from '../../src/core/dice';

const length = (v: Vec3Tuple) => Math.hypot(...v);

const EXPECTED: Record<DieShape, { vertices: number; faces: number; sides: number[] }> = {
  d4: { vertices: 4, faces: 4, sides: [3] },
  d6: { vertices: 8, faces: 6, sides: [4] },
  d8: { vertices: 6, faces: 8, sides: [3] },
  d10: { vertices: 12, faces: 10, sides: [4] },
  d12: { vertices: 20, faces: 12, sides: [5] },
  d20: { vertices: 12, faces: 20, sides: [3] },
  d100: { vertices: 196, faces: 100, sides: [5, 6, 7] },
};

describe.each(SHAPES)('%s polyhedron', (shape) => {
  const data = polyhedronFor(shape);
  const normals = faceNormals(data);

  it('has the expected vertices and faces', () => {
    expect(data.vertices).toHaveLength(EXPECTED[shape].vertices);
    expect(data.faces).toHaveLength(EXPECTED[shape].faces);
    for (const f of data.faces) expect(EXPECTED[shape].sides).toContain(f.length);
  });

  it('can show exactly as many results as the standard die has faces', () => {
    expect(resultCount(data)).toBe(FACE_COUNT[shape]);
    expect(resultCount(data)).toBe(findDie(shape)!.faces.length);
  });

  it('is scaled to its radius', () => {
    expect(data.radius).toBe(SHAPE_RADIUS[shape]);
    expect(Math.max(...data.vertices.map(length))).toBeCloseTo(data.radius, 9);
  });

  it('uses every vertex in some face', () => {
    expect(new Set(data.faces.flat()).size).toBe(data.vertices.length);
  });

  it('has outward, unit face normals (counter-clockwise winding)', () => {
    data.faces.forEach((_, i) => {
      expect(length(normals[i]!)).toBeCloseTo(1, 9);
      expect(dot(normals[i]!, faceCenter(data, i))).toBeGreaterThan(0);
    });
  });

  it('has planar faces', () => {
    data.faces.forEach((face, i) => {
      const c = faceCenter(data, i);
      for (const vi of face) expect(dot(normals[i]!, sub(data.vertices[vi]!, c))).toBeCloseTo(0, 6);
    });
  });

  it('is convex: every vertex is behind every face plane', () => {
    data.faces.forEach((_, i) => {
      const d = dot(normals[i]!, faceCenter(data, i));
      for (const v of data.vertices) expect(dot(normals[i]!, v)).toBeLessThanOrEqual(d + 1e-6);
    });
  });

  it('has convex polygons wound consistently', () => {
    data.faces.forEach((face, i) => {
      face.forEach((vi, k) => {
        const a = data.vertices[vi]!;
        const b = data.vertices[face[(k + 1) % face.length]!]!;
        const c = data.vertices[face[(k + 2) % face.length]!]!;
        const turn = dot(
          [
            (b[1] - a[1]) * (c[2] - b[2]) - (b[2] - a[2]) * (c[1] - b[1]),
            (b[2] - a[2]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[2] - b[2]),
            (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]),
          ],
          normals[i]!,
        );
        expect(turn).toBeGreaterThan(0);
      });
    });
  });

  it('returns the same cached data on every call', () => {
    expect(polyhedronFor(shape)).toBe(data);
  });
});

describe('opposite faces', () => {
  it.each(['d6', 'd8', 'd10', 'd12', 'd20'] as const)(
    'on a %s sum to N+1, like a real die',
    (shape) => {
      const data = polyhedronFor(shape);
      const normals = faceNormals(data);
      const n = data.faces.length;
      normals.forEach((nrm, i) => {
        const opposite = normals.findIndex((m) => dot(nrm, m) < -0.999999);
        expect(opposite).toBe(n - 1 - i);
        expect(i + 1 + (opposite + 1)).toBe(n + 1);
      });
    },
  );
});

describe('d4', () => {
  const d4 = polyhedronFor('d4');

  it('is read by its corners', () => {
    expect(d4.readBy).toBe('vertex');
    expect(readVectors(d4)).toEqual(d4.vertices.map(normalize));
  });

  it('has each corner shared by exactly three faces', () => {
    d4.vertices.forEach((_, vi) => {
      expect(d4.faces.filter((f) => f.includes(vi))).toHaveLength(3);
    });
  });
});

describe('labels', () => {
  it('run along an edge on d6 squares and point at a corner elsewhere', () => {
    expect(polyhedronFor('d6').labelAlign).toBe('edge');
    for (const s of ['d4', 'd8', 'd10', 'd12', 'd20', 'd100'] as const) {
      expect(polyhedronFor(s).labelAlign).toBe('corner');
    }
  });

  it('point at the apex of each d10 kite (its farthest corner)', () => {
    const d10 = polyhedronFor('d10');
    d10.faces.forEach((face, i) => {
      const c = faceCenter(d10, i);
      const dists = face.map((vi) => length(sub(d10.vertices[vi]!, c)));
      expect(dists[0]).toBe(Math.max(...dists));
      const apex = d10.vertices[face[0]!]!;
      expect(Math.hypot(apex[0], apex[2])).toBeCloseTo(0, 9); // on the vertical axis
    });
  });
});

describe('d100 ball', () => {
  const d100 = polyhedronFor('d100');
  const points = fibonacciSphere(100);

  it('has face i facing Fibonacci point i', () => {
    faceNormals(d100).forEach((n, i) => {
      expect(dot(n, points[i]!)).toBeGreaterThan(0.999999);
    });
  });

  it('has faces of similar size (so no number is favoured by area)', () => {
    const areas = d100.faces.map((face, i) => {
      const n = faceNormal(d100, i);
      let a = 0;
      face.forEach((vi, k) => {
        const p = d100.vertices[vi]!;
        const q = d100.vertices[face[(k + 1) % face.length]!]!;
        a += dot(n, [
          p[1] * q[2] - p[2] * q[1],
          p[2] * q[0] - p[0] * q[2],
          p[0] * q[1] - p[1] * q[0],
        ]);
      });
      return a / 2;
    });
    const mean = areas.reduce((s, a) => s + a, 0) / areas.length;
    for (const a of areas) expect(Math.abs(a - mean) / mean).toBeLessThan(0.1);
  });
});

describe('fibonacciSphere', () => {
  it('returns unit vectors', () => {
    for (const p of fibonacciSphere(50)) expect(length(p)).toBeCloseTo(1, 12);
  });
});

describe('convexFaces', () => {
  it('merges coplanar triangles of a cube into 6 squares', () => {
    const cube: Vec3Tuple[] = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) cube.push([x, y, z]);
    const faces = convexFaces(cube);
    expect(faces).toHaveLength(6);
    for (const f of faces) expect(f).toHaveLength(4);
  });

  it('ignores interior points', () => {
    const tetra: Vec3Tuple[] = [
      [1, 1, 1],
      [1, -1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
      [0, 0, 0.1],
    ];
    const faces = convexFaces(tetra);
    expect(faces).toHaveLength(4);
    expect(faces.flat()).not.toContain(4);
  });
});

describe('normalize', () => {
  it('scales a vector to unit length', () => {
    expect(normalize([3, 0, 4])).toEqual([0.6, 0, 0.8]);
  });
});
