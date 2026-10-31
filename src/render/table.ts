import * as THREE from 'three';
import type { DieDefinition } from '../core/dice';
import { secureRandom, type Rng } from '../core/random';
import { DiceWorld, type Arena } from '../physics/world';
import { createDieMesh, disposeDieMesh } from './dieMesh';

/** The 3D dice table as seen by the app: throw dice, get logical face indices back. */
export interface DiceTable {
  /** Throws the dice; resolves with the face index on top of each die, in order. */
  roll(dice: readonly DieDefinition[]): Promise<number[]>;
  dispose(): void;
}

export const VIEW = {
  fov: 35,
  /** Smallest half-extent of the visible table, in world units. */
  minArenaHalf: 3.6,
  /** Keeps dice fully in view: walls sit this far inside the visible edge. */
  edgeMargin: 0.75,
} as const;

/** Camera height needed so the shorter side of the view shows at least minArenaHalf. */
export function cameraHeight(aspect: number, fovDeg: number = VIEW.fov): number {
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(fovDeg / 2));
  const need = VIEW.minArenaHalf + VIEW.edgeMargin;
  return need / (tanHalf * Math.min(1, aspect));
}

/** Play area that matches what a top-down camera at `height` can see. */
export function arenaForView(aspect: number, height: number, fovDeg: number = VIEW.fov): Arena {
  const halfVisibleDepth = height * Math.tan(THREE.MathUtils.degToRad(fovDeg / 2));
  return {
    halfWidth: halfVisibleDepth * aspect - VIEW.edgeMargin,
    halfDepth: halfVisibleDepth - VIEW.edgeMargin,
  };
}

/** Creates the WebGL dice table inside `container`. Throws if WebGL is unavailable. */
export function createDiceTable(container: HTMLElement, rng: Rng = secureRandom): DiceTable {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'table__canvas';
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(VIEW.fov, 1, 0.1, 100);
  camera.up.set(0, 0, -1); // screen-up is the back of the table

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8dce2, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-4, 15, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.radius = 4;
  scene.add(sun);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.ShadowMaterial({ opacity: 0.18 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const world = new DiceWorld({ halfWidth: VIEW.minArenaHalf, halfDepth: VIEW.minArenaHalf });
  let meshes: THREE.Group[] = [];
  let pending: ((faces: number[]) => void) | null = null;
  let lastTime = 0;

  function resize(): void {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const aspect = width / height;
    renderer.setSize(width, height, false);
    camera.aspect = aspect;
    const h = cameraHeight(aspect);
    camera.position.set(0, h, 0);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    const arena = arenaForView(aspect, h);
    world.setArena(arena);
    const s = sun.shadow.camera;
    s.left = s.bottom = -Math.max(arena.halfWidth, arena.halfDepth) - 2;
    s.right = s.top = Math.max(arena.halfWidth, arena.halfDepth) + 2;
    s.updateProjectionMatrix();
    render();
  }

  function sync(): void {
    world.dice.forEach((d, i) => {
      const m = meshes[i]!;
      m.position.set(d.body.position.x, d.body.position.y, d.body.position.z);
      m.quaternion.set(
        d.body.quaternion.x,
        d.body.quaternion.y,
        d.body.quaternion.z,
        d.body.quaternion.w,
      );
    });
  }

  function render(): void {
    renderer.render(scene, camera);
  }

  function frame(time: number): void {
    const dt = lastTime === 0 ? 1 / 60 : Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;
    const done = world.advance(dt);
    sync();
    render();
    if (done) {
      renderer.setAnimationLoop(null);
      const resolve = pending;
      pending = null;
      resolve?.(world.readResults());
    }
  }

  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  return {
    roll(dice) {
      if (pending) return Promise.reject(new Error('A roll is already in progress'));
      for (const m of meshes) {
        scene.remove(m);
        disposeDieMesh(m);
      }
      const physicsDice = world.setDice(dice.map((d) => d.shape));
      meshes = dice.map((die, i) => createDieMesh(die, physicsDice[i]!.data));
      scene.add(...meshes);
      world.throwDice(rng);
      sync();
      lastTime = 0;
      return new Promise<number[]>((resolve) => {
        pending = resolve;
        renderer.setAnimationLoop(frame);
      });
    },
    dispose() {
      renderer.setAnimationLoop(null);
      observer.disconnect();
      for (const m of meshes) disposeDieMesh(m);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
