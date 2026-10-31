import * as THREE from 'three';
import type { DieDefinition } from '../core/dice';
import { faceNormal, type PolyhedronData } from '../physics/polyhedra';
import { faceTexture } from './faceTexture';
import { faceUVs } from './faceUV';

/**
 * Builds a die mesh: one material group per logical face, each textured with
 * that face's label, so face i on the mesh is face i in the physics body.
 */
export function createDieMesh(die: DieDefinition, data: PolyhedronData): THREE.Group {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const geometry = new THREE.BufferGeometry();

  data.faces.forEach((face, fi) => {
    const points = face.map((vi) => data.vertices[vi]!);
    const n = faceNormal(data, fi);
    const faceUv = faceUVs(points, n);
    const start = positions.length / 3;
    // Fan-triangulate the convex polygon.
    for (let k = 1; k < points.length - 1; k++) {
      for (const idx of [0, k, k + 1]) {
        positions.push(...points[idx]!);
        normals.push(...n);
        uvs.push(...faceUv[idx]!);
      }
    }
    geometry.addGroup(start, positions.length / 3 - start, fi);
  });

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

  const materials = die.faces.map(
    (f) => new THREE.MeshStandardMaterial({ map: faceTexture(f.label), roughness: 0.55 }),
  );
  const mesh = new THREE.Mesh(geometry, materials);
  mesh.castShadow = true;

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0x9aa0a6 }),
  );

  const group = new THREE.Group();
  group.add(mesh, edges);
  return group;
}

/** Frees GPU resources of a die mesh (face textures are cached and kept). */
export function disposeDieMesh(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
      obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) m.dispose();
    }
  });
}
