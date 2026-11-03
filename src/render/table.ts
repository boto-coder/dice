import * as THREE from 'three';
import { STANDARD_DICE, type DieDefinition } from '../core/dice';
import type { Crit } from '../core/results';
import { secureRandom, type Rng } from '../core/random';
import { DiceWorld, PHYSICS, type Arena } from '../physics/world';
import { polyhedronFor } from '../physics/polyhedra';
import { createDieMesh, disposeDieMesh, setGlow } from './dieMesh';
import { dieAtlas } from './faceTexture';
import type { Theme } from '../core/settings';

/** The 3D dice table as seen by the app: throw dice, get logical face indices back. */
export interface DiceTable {
  /** Throws the dice; resolves with the face index on top of each die, in order. */
  roll(dice: readonly DieDefinition[]): Promise<number[]>;
  /** Highlights settled dice (e.g. a natural 20 or 1), in the same order as the last roll. */
  highlight(marks: readonly Crit[]): void;
  /**
   * Prepares the textures of these (styled) dice while the browser is idle, so
   * a roll with them doesn't stall. Replaces any earlier list still waiting.
   */
  prepare(dice: readonly DieDefinition[]): void;
  /** Adapts lighting and shadows to the page theme (the table colour itself is CSS). */
  setTheme(theme: Theme): void;
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

/**
 * Per theme: shadows must be darker to show on dark felt, and the light
 * bounced up from the table takes on its colour.
 */
export const TABLE_THEMES: Readonly<
  Record<Theme, { readonly shadowOpacity: number; readonly groundColor: number }>
> = {
  dark: { shadowOpacity: 0.45, groundColor: 0x9fb5aa },
  light: { shadowOpacity: 0.18, groundColor: 0xd8dce2 },
};

/**
 * Light strengths. Measured with a flat die: a #8e1428 face pointing up
 * renders about #9b333e, close to its real colour.
 */
export const LIGHTING = { sky: 2.2, sun: 1.6 } as const;

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
  // Checking shader errors reads the compile log synchronously, which stalls; dev only.
  renderer.debug.checkShaderErrors = import.meta.env.DEV;
  renderer.domElement.className = 'table__canvas';
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(VIEW.fov, 1, 0.1, 100);
  camera.up.set(0, 0, -1); // screen-up is the back of the table

  const ambient = new THREE.HemisphereLight(0xffffff, 0xd8dce2, LIGHTING.sky);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, LIGHTING.sun);
  sun.position.set(-4, 15, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.radius = 4;
  scene.add(sun);

  const shadowMaterial = new THREE.ShadowMaterial({ opacity: TABLE_THEMES.dark.shadowOpacity });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), shadowMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const world = new DiceWorld({ halfWidth: VIEW.minArenaHalf, halfDepth: VIEW.minArenaHalf });
  let meshes: THREE.Group[] = [];
  let pending: ((faces: number[]) => void) | null = null;
  let lastTime = 0;
  let diceCount = 0;

  let canvasWidth = 0;
  let canvasHeight = 0;

  /** Fits the camera and arena to the container and the number of dice. */
  function resize(): void {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const aspect = width / height;
    // Reallocating the drawing buffer is slow, so only do it when the size changed.
    if (width !== canvasWidth || height !== canvasHeight) {
      renderer.setSize(width, height, false);
      canvasWidth = width;
      canvasHeight = height;
    }
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

  // Draw and upload dice textures while the browser is idle, one die at a
  // time, so a roll doesn't stall on them.
  const idle = (fn: () => void): void => {
    if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(fn);
    else setTimeout(fn, 50);
  };
  let disposed = false;
  let queue: readonly DieDefinition[] = STANDARD_DICE;
  let queueVersion = 0;
  /** Finishes whose shaders are compiled (matte and the reflective ones differ). */
  const compiledFinishes = new Set<string>();
  const compileShaders = (): void => {
    // One temporary die per finish not compiled yet, so no roll waits for a shader.
    const samples = queue
      .filter((d, i, all) => {
        const finish = d.style?.finish ?? 'matte';
        return (
          !compiledFinishes.has(finish) &&
          all.findIndex((o) => (o.style?.finish ?? 'matte') === finish) === i
        );
      })
      .map((d) => {
        compiledFinishes.add(d.style?.finish ?? 'matte');
        return createDieMesh(d, polyhedronFor(d.shape));
      });
    if (samples.length === 0) return;
    // A real frame (not just compile) also builds the shadow-map shader. The
    // browser shows only the last frame drawn in a task, so the samples never appear.
    for (const s of samples) s.position.y = 1;
    scene.add(...samples);
    render();
    scene.remove(...samples);
    render();
    for (const s of samples) disposeDieMesh(s);
  };
  const warmUp = (version: number, index: number): void => {
    if (disposed || version !== queueVersion) return;
    const die = queue[index];
    if (!die) {
      compileShaders();
      return;
    }
    renderer.initTexture(dieAtlas(die, polyhedronFor(die.shape), die.style).texture);
    idle(() => warmUp(version, index + 1));
  };
  const startWarmUp = (): void => {
    const version = ++queueVersion;
    idle(() => warmUp(version, 0));
  };
  startWarmUp();

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
      world.throwDice(rng); // also decides each die's label order
      meshes = dice.map((die, i) =>
        createDieMesh(die, physicsDice[i]!.data, physicsDice[i]!.labelOrder),
      );
      scene.add(...meshes);
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
    prepare(dice) {
      queue = dice;
      startWarmUp();
    },
    setTheme(theme) {
      const look = TABLE_THEMES[theme];
      shadowMaterial.opacity = look.shadowOpacity;
      ambient.groundColor.setHex(look.groundColor);
      render();
    },
    highlight(marks) {
      meshes.forEach((m, i) => setGlow(m, marks[i] ?? null));
      render();
    },
    dispose() {
      disposed = true;
      renderer.setAnimationLoop(null);
      observer.disconnect();
      for (const m of meshes) disposeDieMesh(m);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
