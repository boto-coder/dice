import { describe, it, expect } from 'vitest';
import * as CANNON from 'cannon-es';
import { rotatedY, topFaceIndex } from '../../src/physics/faceReading';
import { faceNormals, polyhedronFor, type Vec3Tuple } from '../../src/physics/polyhedra';

const normals = faceNormals(polyhedronFor('d6'));
// Logical d6 face directions (see polyhedra.ts): 1:+z 2:+y 3:+x 4:-x 5:-y 6:-z
const VALUE_BY_INDEX = [1, 2, 3, 4, 5, 6];

function quat(axis: [number, number, number], angle: number): CANNON.Quaternion {
  const q = new CANNON.Quaternion();
  q.setFromAxisAngle(new CANNON.Vec3(...axis), angle);
  return q;
}

describe('rotatedY', () => {
  it('matches cannon-es vector rotation for random rotations', () => {
    const v: Vec3Tuple = [0.3, -0.7, 0.2];
    for (let i = 0; i < 50; i++) {
      const q = new CANNON.Quaternion(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5,
      ).normalize();
      expect(rotatedY(q, v)).toBeCloseTo(q.vmult(new CANNON.Vec3(...v)).y, 10);
    }
  });
});

describe('topFaceIndex on a d6', () => {
  it.each<[string, CANNON.Quaternion, number]>([
    ['identity', new CANNON.Quaternion(), 2],
    ['+90° about x (+z face up)', quat([1, 0, 0], -Math.PI / 2), 1],
    ['-90° about x (-z face up)', quat([1, 0, 0], Math.PI / 2), 6],
    ['+90° about z (+x face up)', quat([0, 0, 1], Math.PI / 2), 3],
    ['-90° about z (-x face up)', quat([0, 0, 1], -Math.PI / 2), 4],
    ['180° about x (upside down)', quat([1, 0, 0], Math.PI), 5],
  ])('%s shows %i', (_, q, value) => {
    expect(VALUE_BY_INDEX[topFaceIndex(normals, q)]).toBe(value);
  });

  it('picks the closest face when the die is tilted', () => {
    // Tilted 30° toward +x from flat: +y face is still closest to up.
    expect(VALUE_BY_INDEX[topFaceIndex(normals, quat([0, 0, 1], Math.PI / 6))]).toBe(2);
    // Tilted 60°: now +x face is closer to up.
    expect(VALUE_BY_INDEX[topFaceIndex(normals, quat([0, 0, 1], Math.PI / 3))]).toBe(3);
  });

  it('returns -1 for a shape with no faces', () => {
    expect(topFaceIndex([], new CANNON.Quaternion())).toBe(-1);
  });
});
