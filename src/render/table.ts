import * as THREE from 'three';
import type { DieDefinition } from '../core/dice';
import type { Crit } from '../core/results';
import { secureRandom, type Rng } from '../core/random';
import { DiceWorld, PHYSICS, type Arena } from '../physics/world';
import { createDieMesh, disposeDieMesh, setGlow } from './dieMesh';

/** The 3D dice table as seen by the app: throw dice, get logical face indices back. */
export interface DiceTable {
  /** Throws the dice; resolves with the face index on top of each die, in order. */
  roll(dice: readonly DieDefinition[]): Promise<number[]>;
  /** Highlights settled dice (e.g. a natural 20 or 1), in the same order as the last roll. */
  highlight(marks: readonly Crit[]): void;
  dispose(): void;
}

export const VIEW = {
  fov: 35,
  /** Smallest half-extent of the visible table, in world units. */
  minArenaHalf: 3.6,
  /** Keeps dice fully in view: walls sit this far inside the visible edge. */
  edgeMargin: 0.75,
  /**
   * Table area each die needs to settle quickly without piling up. Milestone 3
   * simulations showed 20 dice need about a 16×12 table (9.6 units² each);
   * milestone 5 runs with mixed shapes settled faster with a little more room.
   */
  areaPerDie: 12,
} as const;

/** Camera height needed so the shorter side of the view shows at least minArenaHalf. */
export function cameraHeight(aspect: number, fovDeg: number = VIEW.fov): number {
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(fovDeg / 2));
  const need = VIEW.minArenaHalf + VIEW.edgeMargin;
  return need / (tanHalf * Math.min(1, aspect));
}

/**
 * Camera height for a roll of `count` dice: the base height, raised (zooming
 * out) until the visible arena has at least `count × areaPerDie` of floor.
 */
export function cameraHeightForDice(
  aspect: number,
  count: number,
  fovDeg: number = VIEW.fov,
): number {
  const base = cameraHeight(aspect, fovDeg);
  const area = count * VIEW.areaPerDie;
  // Arena is (2·(x·a − m)) × (2·(x − m)) with x = height·tan(fov/2).
  // Solve 4(a·x − m)(x − m) = area for x.
  const a = aspect;
  const m = VIEW.edgeMargin;
  const qa = 4 * a;
  const qb = -4 * m * (a + 1);
  const qc = 4 * m * m - area;
  const x = (-qb + Math.sqrt(qb * qb - 4 * qa * qc)) / (2 * qa);
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(fovDeg / 2));
  return Math.max(base, x / tanHalf);
}

/** Play area that matches what a top-down camera at `height` can see. */
export function arenaForView(aspect: number, height: number, fovDeg: number = VIEW.fov): Arena {
  const halfVisibleDepth = height * Math.tan(THREE.MathUtils.degToRad(fovDeg / 2));
  return {
    halfWidth: halfVisibleDepth * aspect - VIEW.edgeMargin,
    halfDepth: halfVisibleDepth - VIEW.edgeMargin,
  };
}

/** True when the user asked the OS/browser for less motion. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Settles a throw without animating it: the physics runs to the end at once
 * and only the resting dice are shown. The throw is randomised exactly like
 * an animated one, so the results are just as fair.
 */
export function settleInstantly(world: DiceWorld): number[] {
  while (!world.advance(PHYSICS.timeStep));
  return world.readResults();
}

export interface DiceTableOptions {
  rng?: Rng;
  /** Checked on every roll; defaults to the prefers-reduced-motion media query. */
  reducedMotion?: () => boolean;
}

/** Creates the WebGL dice table inside `container`. Throws if WebGL is unavailable. */
export function createDiceTable(
  container: HTMLElement,
  { rng = secureRandom, reducedMotion = prefersReducedMotion }: DiceTableOptions = {},
): DiceTable {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
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
  let diceCount = 0;

  function resize(): void {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const aspect = width / height;
    renderer.setSize(width, height, false);
    camera.aspect = aspect;
    const h = cameraHeightForDice(aspect, diceCount);
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
      diceCount = dice.length;
      resize();
      const physicsDice = world.setDice(dice.map((d) => d.shape));
      meshes = dice.map((die, i) => createDieMesh(die, physicsDice[i]!.data));
      scene.add(...meshes);
      world.throwDice(rng);
      if (reducedMotion()) {
        const faces = settleInstantly(world);
        sync();
        render();
        return Promise.resolve(faces);
      }
      sync();
      lastTime = 0;
      return new Promise<number[]>((resolve) => {
        pending = resolve;
        renderer.setAnimationLoop(frame);
      });
    },
    highlight(marks) {
      meshes.forEach((m, i) => setGlow(m, marks[i] ?? null));
      render();
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
