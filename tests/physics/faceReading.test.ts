import { describe, it, expect } from 'vitest';
import * as CANNON from 'cannon-es';
import { rotatedY, topFaceIndex } from '../../src/physics/faceReading';
import {
  faceNormals,
  polyhedronFor,
  readVectors,
  type Vec3Tuple,
} from '../../src/physics/polyhedra';
import { SHAPES } from '../../src/core/dice';

/** Rotation that turns local direction `from` to point straight up (+y). */
function rotationPointingUp(from: Vec3Tuple): CANNON.Quaternion {
  const q = new CANNON.Quaternion();
  q.setFromVectors(new CANNON.Vec3(...from), new CANNON.Vec3(0, 1, 0));
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

describe('topFaceIndex', () => {
  it.each(SHAPES)('reads every result of a %s when it is turned to the top', (shape) => {
    const vectors = readVectors(polyhedronFor(shape));
    vectors.forEach((v, i) => {
      expect(topFaceIndex(vectors, rotationPointingUp(v))).toBe(i);
    });
  });

  it('reads a d4 by its top corner, which is opposite the face it rests on', () => {
    const d4 = polyhedronFor('d4');
    const vectors = readVectors(d4);
    const normals = faceNormals(d4);
    d4.faces.forEach((face, f) => {
      // Rest on face f: its normal points down.
      const down = rotationPointingUp([-normals[f]![0], -normals[f]![1], -normals[f]![2]]);
      const top = topFaceIndex(vectors, down);
      expect(face).not.toContain(top); // the top corner is the one not on the bottom face
    });
  });

  it('picks the closest face when a d6 is tilted', () => {
    const d6 = polyhedronFor('d6');
    const normals = faceNormals(d6);
    const flat = rotationPointingUp(normals[0]!);
    const tilt = (deg: number) => {
      const t = new CANNON.Quaternion();
      t.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), (deg * Math.PI) / 180);
      return t.mult(flat);
    };
    expect(topFaceIndex(normals, tilt(30))).toBe(0);
    expect(topFaceIndex(normals, tilt(60))).not.toBe(0);
  });

  it('returns -1 for a shape with no faces', () => {
    expect(topFaceIndex([], new CANNON.Quaternion())).toBe(-1);
  });
});
