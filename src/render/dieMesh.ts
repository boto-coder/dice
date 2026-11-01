import * as THREE from 'three';
import type { DieDefinition } from '../core/dice';
import { faceNormal, type PolyhedronData } from '../physics/polyhedra';
import { dieAtlas } from './faceTexture';
import { atlasUV } from './faceUV';

/**
 * Builds a die mesh whose face i matches face i of the physics body, textured
 * from one atlas holding all of the die's labels.
 */
export function createDieMesh(die: DieDefinition, data: PolyhedronData): THREE.Group {
  const atlas = dieAtlas(die, data);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  data.faces.forEach((face, fi) => {
    const points = face.map((vi) => data.vertices[vi]!);
    const n = faceNormal(data, fi);
    const faceUv = atlas.faceUVs[fi]!;
    // Fan-triangulate the convex polygon.
    for (let k = 1; k < points.length - 1; k++) {
      for (const idx of [0, k, k + 1]) {
        positions.push(...points[idx]!);
        normals.push(...n);
        uvs.push(...atlasUV(atlas.layout, fi, faceUv[idx]!));
      }
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ map: atlas.texture, roughness: 0.55 }),
  );
  mesh.castShadow = true;

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 1),
    new THREE.LineBasicMaterial({ color: die.shape === 'd100' ? 0xc4c8cd : 0x9aa0a6 }),
  );

  const group = new THREE.Group();
  group.add(mesh, edges);
  return group;
}

/** Frees GPU resources of a die mesh (atlas textures are cached and kept). */
export function disposeDieMesh(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
      obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) m.dispose();
    }
  });
}
