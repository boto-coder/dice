import type { Vec3Tuple } from './polyhedra';

/** Rotation as a unit quaternion. */
export interface QuatLike {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

/** World-space Y component of a local vector rotated by `q`. */
export function rotatedY(q: QuatLike, v: Vec3Tuple): number {
  // y-row of the rotation matrix built from q.
  const { x, y, z, w } = q;
  return (
    2 * (x * y + w * z) * v[0] + (1 - 2 * (x * x + z * z)) * v[1] + 2 * (y * z - w * x) * v[2]
  );
}

/** Index of the face whose outward normal points most nearly straight up. */
export function topFaceIndex(normals: readonly Vec3Tuple[], q: QuatLike): number {
  let best = -1;
  let bestY = -Infinity;
  normals.forEach((n, i) => {
    const y = rotatedY(q, n);
    if (y > bestY) {
      bestY = y;
      best = i;
    }
  });
  return best;
}
