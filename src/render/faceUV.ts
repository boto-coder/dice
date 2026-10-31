import type { Vec3Tuple } from '../physics/polyhedra';

export type UV = readonly [number, number];

const sub = (a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3Tuple, b: Vec3Tuple) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (v: Vec3Tuple): Vec3Tuple => {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};

/**
 * Texture coordinates for a planar face polygon, so a square texture is
 * centred on the face, unmirrored when seen from outside, and scaled so the
 * polygon's farthest vertex touches the texture's edge.
 *
 * The texture's horizontal axis runs along the polygon's first edge (vertex
 * 0 → 1), so text reads parallel to that edge.
 */
export function faceUVs(points: readonly Vec3Tuple[], normal: Vec3Tuple): UV[] {
  const n = points.length;
  const center: Vec3Tuple = [
    points.reduce((s, p) => s + p[0], 0) / n,
    points.reduce((s, p) => s + p[1], 0) / n,
    points.reduce((s, p) => s + p[2], 0) / n,
  ];
  const uAxis = unit(sub(points[1]!, points[0]!));
  const vAxis = cross(normal, uAxis);
  const coords = points.map((p) => {
    const d = sub(p, center);
    return [dot(d, uAxis), dot(d, vAxis)] as const;
  });
  const extent = Math.max(...coords.map(([u, v]) => Math.max(Math.abs(u), Math.abs(v))));
  return coords.map(([u, v]) => [0.5 + u / (2 * extent), 0.5 + v / (2 * extent)] as const);
}
