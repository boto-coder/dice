import { FACE_COUNT, type DieShape } from '../core/dice';

export type Vec3Tuple = readonly [number, number, number];

/**
 * Shape data shared by physics and rendering.
 *
 * - `faces[f]` is a convex polygon (vertex indices, counter-clockwise seen
 *   from outside). Vertex 0 of each polygon is the "up" corner for its label.
 * - `readBy: 'face'`: logical result i is face i (the face pointing up).
 * - `readBy: 'vertex'`: logical result i is vertex i (the corner pointing up),
 *   as on a d4. Each face then shows the labels of its own corners.
 */
export interface PolyhedronData {
  readonly vertices: readonly Vec3Tuple[];
  readonly faces: readonly (readonly number[])[];
  readonly readBy: 'face' | 'vertex';
  /** Labels point at vertex 0 ('corner') or run along edge 0→1 ('edge', for squares). */
  readonly labelAlign: 'corner' | 'edge';
  /** Distance from the centre to the farthest vertex. */
  readonly radius: number;
}

// ---------------------------------------------------------------- vector math

export const sub = (a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
export const dot = (a: Vec3Tuple, b: Vec3Tuple): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const scale = (a: Vec3Tuple, s: number): Vec3Tuple => [a[0] * s, a[1] * s, a[2] * s];
const length = (a: Vec3Tuple): number => Math.hypot(a[0], a[1], a[2]);

export function normalize(v: Vec3Tuple): Vec3Tuple {
  const len = length(v);
  return [v[0] / len, v[1] / len, v[2] / len];
}

function centroid(points: readonly Vec3Tuple[]): Vec3Tuple {
  const s = points.reduce<[number, number, number]>(
    (acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]],
    [0, 0, 0],
  );
  return scale(s, 1 / points.length);
}

// ------------------------------------------------------------- convex hull

const EPS = 1e-7;

/**
 * Faces of the convex hull of `vertices` (which must surround the origin),
 * as polygons of vertex indices, counter-clockwise from outside. Coplanar
 * hull triangles are merged into one polygon. Brute force (O(n^4)), which is
 * fine for the few hundred points used here and runs once per shape.
 */
export function convexFaces(vertices: readonly Vec3Tuple[]): number[][] {
  const n = vertices.length;
  const seen = new Set<string>();
  const faces: number[][] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const a = vertices[i]!;
        let normal = cross(sub(vertices[j]!, a), sub(vertices[k]!, a));
        const len = length(normal);
        if (len < EPS) continue; // collinear
        normal = scale(normal, 1 / len);
        let d = dot(normal, a);
        if (d < 0) {
          normal = scale(normal, -1);
          d = -d;
        }
        let onPlane: number[] = [];
        let supporting = true;
        for (let m = 0; m < n; m++) {
          const dist = dot(normal, vertices[m]!) - d;
          if (dist > EPS) {
            supporting = false;
            break;
          }
          if (dist > -EPS) onPlane.push(m);
        }
        if (!supporting) continue;
        const key = onPlane.join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        onPlane = sortAround(vertices, onPlane, normal);
        faces.push(onPlane);
      }
    }
  }
  return faces;
}

/** Sorts coplanar vertex indices counter-clockwise around `normal`. */
function sortAround(
  vertices: readonly Vec3Tuple[],
  indices: number[],
  normal: Vec3Tuple,
): number[] {
  const c = centroid(indices.map((i) => vertices[i]!));
  const u = normalize(sub(vertices[indices[0]!]!, c));
  const v = cross(normal, u);
  const angle = (i: number) => {
    const d = sub(vertices[i]!, c);
    return Math.atan2(dot(d, v), dot(d, u));
  };
  return [...indices].sort((p, q) => angle(p) - angle(q));
}

// --------------------------------------------------------- face helpers

/** Centroid of a face polygon. */
export function faceCenter(data: Pick<PolyhedronData, 'vertices' | 'faces'>, f: number): Vec3Tuple {
  return centroid(data.faces[f]!.map((i) => data.vertices[i]!));
}

/** Outward unit normal of a face (Newell's method, robust for any polygon). */
export function faceNormal(data: Pick<PolyhedronData, 'vertices' | 'faces'>, f: number): Vec3Tuple {
  const face = data.faces[f]!;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  face.forEach((vi, k) => {
    const a = data.vertices[vi]!;
    const b = data.vertices[face[(k + 1) % face.length]!]!;
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  });
  return normalize([nx, ny, nz]);
}

export function faceNormals(data: Pick<PolyhedronData, 'vertices' | 'faces'>): Vec3Tuple[] {
  return data.faces.map((_, i) => faceNormal(data, i));
}

/** Directions used to read the result: face normals, or vertex directions for d4. */
export function readVectors(data: PolyhedronData): Vec3Tuple[] {
  return data.readBy === 'vertex' ? data.vertices.map(normalize) : faceNormals(data);
}

/** Rotates a polygon so its vertex farthest from the face centre comes first (label "up"). */
function startAtFarthest(vertices: readonly Vec3Tuple[], face: number[]): number[] {
  const c = centroid(face.map((i) => vertices[i]!));
  let best = 0;
  let bestDist = -1;
  face.forEach((vi, k) => {
    const dist = length(sub(vertices[vi]!, c));
    if (dist > bestDist + 1e-9) {
      bestDist = dist;
      best = k;
    }
  });
  return [...face.slice(best), ...face.slice(0, best)];
}

/**
 * Orders faces so face i and face N-1-i are opposite each other. With values
 * 1..N this makes opposite faces sum to N+1, like real dice. Faces without an
 * opposite (none on the shapes used here) keep their relative order.
 */
function pairOpposites(vertices: readonly Vec3Tuple[], faces: number[][]): number[][] {
  const data = { vertices, faces };
  const normals = faces.map((_, i) => faceNormal(data, i));
  const result: (number[] | undefined)[] = new Array(faces.length);
  const used = new Set<number>();
  let lo = 0;
  let hi = faces.length - 1;
  faces.forEach((_, i) => {
    if (used.has(i)) return;
    const j = normals.findIndex(
      (m, k) => !used.has(k) && k !== i && dot(normals[i]!, m) < -1 + 1e-6,
    );
    used.add(i);
    result[lo++] = faces[i];
    if (j >= 0) {
      used.add(j);
      result[hi--] = faces[j];
    }
  });
  return result.filter((f): f is number[] => f !== undefined);
}

function scaleTo(vertices: readonly Vec3Tuple[], radius: number): Vec3Tuple[] {
  const r = Math.max(...vertices.map(length));
  return vertices.map((v) => scale(v, radius / r));
}

function build(
  rawVertices: readonly Vec3Tuple[],
  radius: number,
  options: { readBy?: 'face' | 'vertex'; labelAlign?: 'corner' | 'edge' } = {},
): PolyhedronData {
  const vertices = scaleTo(rawVertices, radius);
  const labelAlign = options.labelAlign ?? 'corner';
  let faces = convexFaces(vertices);
  if (labelAlign === 'corner') faces = faces.map((f) => startAtFarthest(vertices, f));
  faces = pairOpposites(vertices, faces);
  return { vertices, faces, readBy: options.readBy ?? 'face', labelAlign, radius };
}

// ------------------------------------------------------------------ shapes

const PHI = (1 + Math.sqrt(5)) / 2;

/** Visual/physical size of each shape (circumradius, world units). */
export const SHAPE_RADIUS: Readonly<Record<DieShape, number>> = {
  d4: 0.95,
  d6: Math.sqrt(3) / 2, // edge length 1
  d8: 0.85,
  d10: 0.82,
  d12: 0.85,
  d20: 0.85,
  d100: 1.0,
};

function d4(): PolyhedronData {
  return build(
    [
      [1, 1, 1],
      [1, -1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
    ],
    SHAPE_RADIUS.d4,
    { readBy: 'vertex' },
  );
}

function d6(): PolyhedronData {
  const v: Vec3Tuple[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x, y, z]);
  // Labels on squares run along an edge rather than pointing at a corner.
  return build(v, SHAPE_RADIUS.d6, { labelAlign: 'edge' });
}

function d8(): PolyhedronData {
  return build(
    [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ],
    SHAPE_RADIUS.d8,
  );
}

/**
 * Pentagonal trapezohedron: two apexes and a zig-zag ring of 10 vertices.
 * Ring height `a` keeps each kite planar: apex = a(1+cos36°)/(1-cos36°).
 */
function d10(): PolyhedronData {
  const c36 = Math.cos(Math.PI / 5);
  const a = 0.1056;
  const apex = (a * (1 + c36)) / (1 - c36);
  const v: Vec3Tuple[] = [
    [0, apex, 0],
    [0, -apex, 0],
  ];
  for (let k = 0; k < 10; k++) {
    const ang = (k * Math.PI) / 5;
    v.push([Math.cos(ang), k % 2 === 0 ? a : -a, Math.sin(ang)]);
  }
  return build(v, SHAPE_RADIUS.d10);
}

function d12(): PolyhedronData {
  const v: Vec3Tuple[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x, y, z]);
  for (const s of [-1, 1]) {
    for (const t of [-1, 1]) {
      v.push([0, s / PHI, t * PHI]);
      v.push([s / PHI, t * PHI, 0]);
      v.push([s * PHI, 0, t / PHI]);
    }
  }
  return build(v, SHAPE_RADIUS.d12);
}

function d20(): PolyhedronData {
  const v: Vec3Tuple[] = [];
  for (const s of [-1, 1]) {
    for (const t of [-1, 1]) {
      v.push([0, s, t * PHI]);
      v.push([s, t * PHI, 0]);
      v.push([s * PHI, 0, t]);
    }
  }
  return build(v, SHAPE_RADIUS.d20);
}

/** `count` points spread evenly over the unit sphere (Fibonacci lattice). */
export function fibonacciSphere(count: number): Vec3Tuple[] {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, i) => {
    const y = 1 - (2 * i + 1) / count;
    const r = Math.sqrt(1 - y * y);
    return [Math.cos(golden * i) * r, y, Math.sin(golden * i) * r] as const;
  });
}

/**
 * The d100 "ball": one flat face per Fibonacci point, cut by that point's
 * tangent plane. Built as the polar dual of the points' convex hull: each
 * hull facet (plane n·x = d) becomes a vertex n/d, and the face for point i
 * is the ring of those vertices around it. Face i shows value i+1.
 */
function d100(): PolyhedronData {
  const points = fibonacciSphere(FACE_COUNT.d100);
  const hull = convexFaces(points);
  const vertices: Vec3Tuple[] = hull.map((f) => {
    const n = faceNormal({ vertices: points, faces: [f] }, 0);
    return scale(n, 1 / dot(n, points[f[0]!]!));
  });
  const faces = points.map((p, i) => {
    const ring = hull.flatMap((f, vi) => (f.includes(i) ? [vi] : []));
    return startAtFarthest(vertices, sortAround(vertices, ring, p));
  });
  const scaled = scaleTo(vertices, SHAPE_RADIUS.d100);
  return {
    vertices: scaled,
    faces,
    readBy: 'face',
    labelAlign: 'corner',
    radius: SHAPE_RADIUS.d100,
  };
}

const BUILDERS: Record<DieShape, () => PolyhedronData> = { d4, d6, d8, d10, d12, d20, d100 };
const cache = new Map<DieShape, PolyhedronData>();

/** Shape data for a die (computed once, then cached). */
export function polyhedronFor(shape: DieShape): PolyhedronData {
  let data = cache.get(shape);
  if (!data) {
    data = BUILDERS[shape]();
    cache.set(shape, data);
  }
  return data;
}

/** Number of logical results the shape can show (faces, or vertices for a d4). */
export function resultCount(data: PolyhedronData): number {
  return data.readBy === 'vertex' ? data.vertices.length : data.faces.length;
}
