import { cross, dot, normalize, sub, type Vec3Tuple } from '../physics/polyhedra';

export type UV = readonly [number, number];

/**
 * Texture coordinates for a planar face polygon, so a square texture cell is
 * centred on the face, unmirrored when seen from outside, and scaled so the
 * polygon's farthest vertex touches the cell's edge.
 *
 * - `'edge'`: the label's horizontal runs along edge vertex 0 → 1 (squares).
 * - `'corner'`: the label's "up" points at vertex 0 (triangles, kites, …).
 */
export function faceUVs(
  points: readonly Vec3Tuple[],
  normal: Vec3Tuple,
  align: 'edge' | 'corner' = 'edge',
): UV[] {
  const n = points.length;
  const center: Vec3Tuple = [
    points.reduce((s, p) => s + p[0], 0) / n,
    points.reduce((s, p) => s + p[1], 0) / n,
    points.reduce((s, p) => s + p[2], 0) / n,
  ];
  let uAxis: Vec3Tuple;
  let vAxis: Vec3Tuple;
  if (align === 'edge') {
    uAxis = normalize(sub(points[1]!, points[0]!));
    vAxis = cross(normal, uAxis);
  } else {
    vAxis = normalize(sub(points[0]!, center));
    uAxis = cross(vAxis, normal);
  }
  const coords = points.map((p) => {
    const d = sub(p, center);
    return [dot(d, uAxis), dot(d, vAxis)] as const;
  });
  const extent = Math.max(...coords.map(([u, v]) => Math.max(Math.abs(u), Math.abs(v))));
  return coords.map(([u, v]) => [0.5 + u / (2 * extent), 0.5 + v / (2 * extent)] as const);
}

/** Radius of the largest circle around the cell centre (0.5, 0.5) that fits in the polygon. */
export function inradius(uvs: readonly UV[]): number {
  let r = Infinity;
  uvs.forEach(([x1, y1], i) => {
    const [x2, y2] = uvs[(i + 1) % uvs.length]!;
    const len = Math.hypot(x2 - x1, y2 - y1);
    const dist = Math.abs((x2 - x1) * (y1 - 0.5) - (x1 - 0.5) * (y2 - y1)) / len;
    r = Math.min(r, dist);
  });
  return r;
}

/** Grid of square cells in a texture atlas, one cell per face. */
export interface AtlasLayout {
  readonly columns: number;
  readonly rows: number;
  /** Cell size in pixels. */
  readonly cell: number;
  /** Fraction of a cell left empty on each side, to avoid bleeding between cells. */
  readonly pad: number;
}

export const MAX_ATLAS_SIZE = 2048;
export const MAX_CELL_SIZE = 256;

export function atlasLayout(cellCount: number): AtlasLayout {
  const columns = Math.max(1, Math.ceil(Math.sqrt(cellCount)));
  const rows = Math.max(1, Math.ceil(cellCount / columns));
  const cell = Math.min(MAX_CELL_SIZE, Math.floor(MAX_ATLAS_SIZE / columns));
  return { columns, rows, cell, pad: 0.02 };
}

/** Maps a cell-local UV (0..1) of cell `index` to atlas UV (v up, as WebGL expects). */
export function atlasUV(layout: AtlasLayout, index: number, [u, v]: UV): UV {
  const col = index % layout.columns;
  const row = Math.floor(index / layout.columns);
  const span = 1 - 2 * layout.pad;
  return [
    (col + layout.pad + u * span) / layout.columns,
    1 - (row + 1 - layout.pad - v * span) / layout.rows,
  ];
}

/** Maps a cell-local UV of cell `index` to canvas pixels (y down). */
export function atlasPixel(layout: AtlasLayout, index: number, [u, v]: UV): UV {
  const col = index % layout.columns;
  const row = Math.floor(index / layout.columns);
  const span = 1 - 2 * layout.pad;
  return [
    (col + layout.pad + u * span) * layout.cell,
    (row + 1 - layout.pad - v * span) * layout.cell,
  ];
}
