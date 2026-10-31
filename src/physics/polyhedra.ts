import type { DieShape } from '../core/dice';

export type Vec3Tuple = readonly [number, number, number];

/**
 * Shape data shared by physics and rendering.
 * `faces[i]` is the polygon (vertex indices, counter-clockwise seen from
 * outside) for logical face i, i.e. the face that shows `die.faces[i]`.
 */
export interface PolyhedronData {
  readonly vertices: readonly Vec3Tuple[];
  readonly faces: readonly (readonly number[])[];
}

/** Edge length used for all dice shapes (world units). */
export const DIE_SIZE = 1;

const h = DIE_SIZE / 2;

/*
 * Cube vertex layout:
 *   0 (-,-,-)  1 (+,-,-)  2 (+,+,-)  3 (-,+,-)
 *   4 (-,-,+)  5 (+,-,+)  6 (+,+,+)  7 (-,+,+)
 * Logical faces are ordered so opposite faces sum to 7 like a real d6:
 *   1:+z  2:+y  3:+x  4:-x  5:-y  6:-z
 */
const D6: PolyhedronData = {
  vertices: [
    [-h, -h, -h],
    [h, -h, -h],
    [h, h, -h],
    [-h, h, -h],
    [-h, -h, h],
    [h, -h, h],
    [h, h, h],
    [-h, h, h],
  ],
  faces: [
    [4, 5, 6, 7], // 1: +z
    [3, 7, 6, 2], // 2: +y
    [1, 2, 6, 5], // 3: +x
    [0, 4, 7, 3], // 4: -x
    [0, 1, 5, 4], // 5: -y
    [0, 3, 2, 1], // 6: -z
  ],
};

const POLYHEDRA: Partial<Record<DieShape, PolyhedronData>> = { d6: D6 };

export function polyhedronFor(shape: DieShape): PolyhedronData {
  const data = POLYHEDRA[shape];
  if (!data) throw new Error(`No geometry for ${shape} yet`);
  return data;
}

function sub(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function normalize(v: Vec3Tuple): Vec3Tuple {
  const len = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / len, v[1] / len, v[2] / len];
}

/** Centroid of a face polygon. */
export function faceCenter(data: PolyhedronData, faceIndex: number): Vec3Tuple {
  const face = data.faces[faceIndex]!;
  const sum = face.reduce<[number, number, number]>(
    (acc, vi) => {
      const v = data.vertices[vi]!;
      return [acc[0] + v[0], acc[1] + v[1], acc[2] + v[2]];
    },
    [0, 0, 0],
  );
  return [sum[0] / face.length, sum[1] / face.length, sum[2] / face.length];
}

/** Outward unit normal of a face (from its counter-clockwise winding). */
export function faceNormal(data: PolyhedronData, faceIndex: number): Vec3Tuple {
  const face = data.faces[faceIndex]!;
  const [a, b, c] = [face[0]!, face[1]!, face[2]!].map((i) => data.vertices[i]!) as [
    Vec3Tuple,
    Vec3Tuple,
    Vec3Tuple,
  ];
  return normalize(cross(sub(b, a), sub(c, a)));
}

export function faceNormals(data: PolyhedronData): Vec3Tuple[] {
  return data.faces.map((_, i) => faceNormal(data, i));
}
