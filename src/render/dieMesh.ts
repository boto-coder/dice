import * as THREE from 'three';
import type { DieDefinition } from '../core/dice';
import type { Crit } from '../core/results';
import { faceNormal, type PolyhedronData } from '../physics/polyhedra';
import { dieAtlas } from './faceTexture';
import { atlasUV } from './faceUV';

/**
 * Builds a die mesh whose face i matches face i of the physics body, textured
 * from one atlas holding all of the die's labels. With a `labelOrder`, face k
 * shows label labelOrder[k] (see SHUFFLED_LABEL_SHAPES).
 */
export function createDieMesh(
  die: DieDefinition,
  data: PolyhedronData,
  labelOrder: readonly number[] | null = null,
): THREE.Group {
  const atlas = dieAtlas(die, data);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  data.faces.forEach((face, fi) => {
    const points = face.map((vi) => data.vertices[vi]!);
    const n = faceNormal(data, fi);
    const faceUv = atlas.faceUVs[fi]!;
    const cell = labelOrder ? labelOrder[fi]! : fi;
    // Fan-triangulate the convex polygon.
    for (let k = 1; k < points.length - 1; k++) {
      for (const idx of [0, k, k + 1]) {
        positions.push(...points[idx]!);
        normals.push(...n);
        uvs.push(...atlasUV(atlas.layout, cell, faceUv[idx]!));
      }
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

  const mesh = new THREE.Mesh(geometry, dieMaterial(atlas.texture, null));
  mesh.castShadow = true;

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 1),
    lineMaterial(die.shape === 'd100' ? 0xc4c8cd : 0x9aa0a6),
  );

  const group = new THREE.Group();
  group.add(mesh, edges);
  return group;
}

/** Glow colours for highlighted dice: natural 20 (success) and natural 1 (failure). */
export const GLOW: Readonly<Record<NonNullable<Crit>, number>> = {
  success: 0x1a7f37,
  failure: 0xcf222e,
};

// Materials are cached and never disposed: disposing them would free their
// shader programs, and recompiling those on every roll stalls the first frame.
const dieMaterials = new Map<string, THREE.MeshStandardMaterial>();
const lineMaterials = new Map<number, THREE.LineBasicMaterial>();

/** The (shared) material for a label texture, plain or glowing for a crit. */
export function dieMaterial(texture: THREE.Texture, crit: Crit): THREE.MeshStandardMaterial {
  const key = `${texture.uuid}|${crit ?? ''}`;
  let material = dieMaterials.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.55 });
    if (crit) {
      material.emissive.setHex(GLOW[crit]);
      material.emissiveIntensity = 0.45;
    }
    dieMaterials.set(key, material);
  }
  return material;
}

function lineMaterial(color: number): THREE.LineBasicMaterial {
  let material = lineMaterials.get(color);
  if (!material) {
    material = new THREE.LineBasicMaterial({ color });
    lineMaterials.set(color, material);
  }
  return material;
}

/** Tints a die to mark a critical result, or clears the tint. */
export function setGlow(group: THREE.Group, crit: Crit): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
      obj.material = dieMaterial(obj.material.map!, crit);
    }
  });
}

/** Frees a die mesh's geometry (cached textures and materials are kept). */
export function disposeDieMesh(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) obj.geometry.dispose();
  });
}
