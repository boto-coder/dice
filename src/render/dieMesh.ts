import * as THREE from 'three';
import type { DieDefinition } from '../core/dice';
import { luminance, mix } from '../core/colour';
import { DEFAULT_STYLE, type DiceStyle, type Finish } from '../core/diceStyle';
import type { Crit } from '../core/results';
import { faceNormal, type PolyhedronData } from '../physics/polyhedra';
import { studioEnvironment } from './environment';
import { dieAtlas, onAtlasEvicted } from './faceTexture';
import { atlasUV } from './faceUV';

/** Surface response per finish; `env` is the strength of the studio reflection (none for matte). */
export const FINISH_LOOK: Readonly<
  Record<Finish, { readonly roughness: number; readonly metalness: number; readonly env: number }>
> = {
  matte: { roughness: 0.55, metalness: 0, env: 0 },
  glossy: { roughness: 0.2, metalness: 0, env: 0.5 },
  metallic: { roughness: 0.3, metalness: 0.85, env: 1.2 },
};

/** Edge line colour: a darker shade on light dice, a lighter one on dark dice. */
export function edgeColour(style: DiceStyle, d100 = false): number {
  const light = luminance(style.body) > 0.35;
  const amount = d100 ? 0.18 : 0.32;
  const hex = light ? mix(style.body, '#000000', amount) : mix(style.body, '#ffffff', amount);
  return parseInt(hex.slice(1), 16);
}

/**
 * Builds a die mesh whose face i matches face i of the physics body, textured
 * from one atlas holding all of the die's faces in its style (`die.style`, or
 * the default). With a `labelOrder`, face k shows label labelOrder[k] (see
 * SHUFFLED_LABEL_SHAPES).
 */
export function createDieMesh(
  die: DieDefinition,
  data: PolyhedronData,
  labelOrder: readonly number[] | null = null,
): THREE.Group {
  const style = die.style ?? DEFAULT_STYLE;
  const atlas = dieAtlas(die, data, style);
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

  const mesh = new THREE.Mesh(geometry, dieMaterial(atlas.texture, null, style.finish));
  mesh.castShadow = true;

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 1),
    lineMaterial(edgeColour(style, die.shape === 'd100')),
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
const materialFinish = new WeakMap<THREE.MeshStandardMaterial, Finish>();

// Forget the materials of textures the atlas cache has dropped.
onAtlasEvicted((texture) => {
  for (const key of [...dieMaterials.keys()]) {
    if (key.startsWith(`${texture.uuid}|`)) dieMaterials.delete(key);
  }
});
const lineMaterials = new Map<number, THREE.LineBasicMaterial>();

/** The (shared) material for a die texture and finish, plain or glowing for a crit. */
export function dieMaterial(
  texture: THREE.Texture,
  crit: Crit,
  finish: Finish = 'matte',
): THREE.MeshStandardMaterial {
  const key = `${texture.uuid}|${crit ?? ''}|${finish}`;
  let material = dieMaterials.get(key);
  if (!material) {
    const look = FINISH_LOOK[finish];
    material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: look.roughness,
      metalness: look.metalness,
      envMapIntensity: look.env,
      envMap: look.env > 0 ? studioEnvironment() : null,
    });
    materialFinish.set(material, finish);
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
      obj.material = dieMaterial(obj.material.map!, crit, materialFinish.get(obj.material));
    }
  });
}

/** Frees a die mesh's geometry (cached textures and materials are kept). */
export function disposeDieMesh(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) obj.geometry.dispose();
  });
}
