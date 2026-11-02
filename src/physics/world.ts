import * as CANNON from 'cannon-es';
import type { DieShape } from '../core/dice';
import { randomBetween, secureRandom, type Rng } from '../core/random';
import { rotatedY, topFaceIndex } from './faceReading';
import {
  faceNormal,
  faceNormals,
  polyhedronFor,
  readVectors,
  type PolyhedronData,
  type Vec3Tuple,
} from './polyhedra';

/** Half-size of the rectangular play area on the floor (world units). */
export interface Arena {
  readonly halfWidth: number;
  readonly halfDepth: number;
}

/** Physics tuning. Gravity is exaggerated so small dice feel snappy. */
export const PHYSICS = {
  gravity: -50,
  timeStep: 1 / 60,
  diceMass: 1,
  floorFriction: 0.35,
  floorRestitution: 0.35,
  wallFriction: 0.05,
  wallRestitution: 0.6,
  diceFriction: 0.1,
  diceRestitution: 0.4,
  solverIterations: 20,
  sleepSpeedLimit: 0.5,
  sleepTimeLimit: 0.1,
  angularDamping: 0.5,
  linearDamping: 0.3,
  /** If dice have not come to rest by then, they are frozen and read as-is. */
  settleTimeoutSeconds: 5,
  dropHeight: 3,
  /**
   * A die whose top face normal is less upright than this (cosine of the tilt)
   * is "cocked" (e.g. leaning on another die) and gets nudged, like re-rolling
   * a cocked die at the table.
   */
  flatThreshold: 0.95,
  maxNudges: 3,
  /**
   * A die moving slower than this (units/s, rad/s) for stillSeconds counts as
   * resting even if the engine never puts it to sleep.
   */
  stillSpeed: 0.3,
  stillSpin: 0.8,
  stillSeconds: 0.4,
  /** Share of the table (per axis) over which dice start. */
  throwSpread: 0.8,
  /** Horizontal throw speed range. */
  throwSpeedMin: 2,
  throwSpeedMax: 6,
} as const;

export interface PhysicsDie {
  readonly shape: DieShape;
  readonly body: CANNON.Body;
  readonly data: PolyhedronData;
  /** Outward face normals (for flatness checks). */
  readonly normals: readonly Vec3Tuple[];
  /** Directions that decide the result: face normals, or corner directions for a d4. */
  readonly readVectors: readonly Vec3Tuple[];
  /**
   * Which label each physical face shows for the current throw: face k shows
   * label labelOrder[k]. Null means face k shows label k.
   */
  labelOrder: readonly number[] | null;
}

/**
 * Shapes whose labels are shuffled onto the faces before every throw. The
 * d100 ball cannot be built with 100 identical faces, and fairness tests
 * showed some of its faces land measurably more often than others (as with
 * physical ball dice). Shuffling which number sits on which face makes every
 * number exactly equally likely, whichever faces the physics favours.
 */
export const SHUFFLED_LABEL_SHAPES: ReadonlySet<DieShape> = new Set<DieShape>(['d100']);

/** Floor or wall plane; collides with every die hull (but not the d100's ball). */
function tableShape(): CANNON.Plane {
  const plane = new CANNON.Plane();
  plane.collisionFilterGroup = COLLISION.table;
  plane.collisionFilterMask = COLLISION.hull | COLLISION.ballHull;
  return plane;
}

function toConvex(data: PolyhedronData): CANNON.ConvexPolyhedron {
  return new CANNON.ConvexPolyhedron({
    vertices: data.vertices.map(([x, y, z]) => new CANNON.Vec3(x, y, z)),
    faces: data.faces.map((f) => [...f]),
  });
}

/**
 * Collision groups (bit flags). The d100's 100-face hull is very expensive to
 * collide with another hull, so it touches only the table; a ball shape
 * stands in for it against other dice. Its resting face is still decided by
 * the real hull on the floor, so the result stays fair.
 */
export const COLLISION = {
  table: 1,
  hull: 2,
  ballHull: 4,
  ball: 8,
} as const;

/** Radius of the ball standing in for a ball-style die: midway between in- and circumradius. */
export function ballRadius(data: PolyhedronData): number {
  const inradius = Math.min(
    ...data.faces.map((_, i) => {
      const n = faceNormal(data, i);
      const v = data.vertices[data.faces[i]![0]!]!;
      return n[0] * v[0] + n[1] * v[1] + n[2] * v[2];
    }),
  );
  const circumradius = Math.max(...data.vertices.map((v) => Math.hypot(...v)));
  return (inradius + circumradius) / 2;
}

/** Collision shapes of a die body, with their collision groups set. */
export function dieShapes(shape: DieShape, data: PolyhedronData): CANNON.Shape[] {
  const hull = toConvex(data);
  if (shape !== 'd100') {
    hull.collisionFilterGroup = COLLISION.hull;
    hull.collisionFilterMask = COLLISION.table | COLLISION.hull | COLLISION.ball;
    return [hull];
  }
  hull.collisionFilterGroup = COLLISION.ballHull;
  hull.collisionFilterMask = COLLISION.table;
  const ball = new CANNON.Sphere(ballRadius(data));
  ball.collisionFilterGroup = COLLISION.ball;
  ball.collisionFilterMask = COLLISION.hull | COLLISION.ball;
  return [hull, ball];
}

/** The numbers 0..n-1 in random order (Fisher–Yates). */
export function shuffled(n: number, rng: Rng): number[] {
  const out = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Uniformly random rotation (Shoemake's method). */
export function randomQuaternion(rng: Rng): CANNON.Quaternion {
  const u1 = rng();
  const u2 = rng() * 2 * Math.PI;
  const u3 = rng() * 2 * Math.PI;
  const a = Math.sqrt(1 - u1);
  const b = Math.sqrt(u1);
  return new CANNON.Quaternion(
    a * Math.sin(u2),
    a * Math.cos(u2),
    b * Math.sin(u3),
    b * Math.cos(u3),
  );
}

export class DiceWorld {
  readonly world: CANNON.World;
  private readonly diceMaterial = new CANNON.Material('dice');
  private readonly floorMaterial = new CANNON.Material('floor');
  private readonly wallMaterial = new CANNON.Material('wall');
  private walls: CANNON.Body[] = [];
  private _arena: Arena;
  private _dice: PhysicsDie[] = [];
  private elapsed = 0;
  private nudges = 0;
  private nudgeCounts: number[] = [];
  /** Shuffle labels of SHUFFLED_LABEL_SHAPES dice on each throw (off only to measure raw face bias). */
  shuffleLabels = true;
  /** Seconds each die has been nearly still (see isResting). */
  private stillTime: number[] = [];
  private rng: Rng = secureRandom;

  constructor(arena: Arena) {
    this._arena = arena;
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, PHYSICS.gravity, 0) });
    this.world.allowSleep = true;
    (this.world.solver as CANNON.GSSolver).iterations = PHYSICS.solverIterations;
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.diceMaterial, this.floorMaterial, {
        friction: PHYSICS.floorFriction,
        restitution: PHYSICS.floorRestitution,
      }),
    );
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.diceMaterial, this.wallMaterial, {
        friction: PHYSICS.wallFriction,
        restitution: PHYSICS.wallRestitution,
      }),
    );
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(this.diceMaterial, this.diceMaterial, {
        friction: PHYSICS.diceFriction,
        restitution: PHYSICS.diceRestitution,
      }),
    );

    const floor = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: tableShape(),
      material: this.floorMaterial,
    });
    floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // plane normal +z -> +y
    this.world.addBody(floor);
    this.buildWalls();
  }

  get arena(): Arena {
    return this._arena;
  }

  get dice(): readonly PhysicsDie[] {
    return this._dice;
  }

  /** Resizes the play area, e.g. when the viewport changes. */
  setArena(arena: Arena): void {
    this._arena = arena;
    this.buildWalls();
  }

  private buildWalls(): void {
    for (const w of this.walls) this.world.removeBody(w);
    const { halfWidth: hw, halfDepth: hd } = this._arena;
    // Plane normals point inward, toward the arena center.
    const specs: [CANNON.Vec3, [number, number, number]][] = [
      [new CANNON.Vec3(-hw, 0, 0), [0, Math.PI / 2, 0]], // left wall, normal +x
      [new CANNON.Vec3(hw, 0, 0), [0, -Math.PI / 2, 0]], // right wall, normal -x
      [new CANNON.Vec3(0, 0, -hd), [0, 0, 0]], // back wall, normal +z
      [new CANNON.Vec3(0, 0, hd), [0, Math.PI, 0]], // front wall, normal -z
    ];
    this.walls = specs.map(([pos, [x, y, z]]) => {
      const body = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: tableShape(),
        material: this.wallMaterial,
        position: pos,
      });
      body.quaternion.setFromEuler(x, y, z);
      this.world.addBody(body);
      return body;
    });
  }

  /** Replaces all dice in the world with new ones of the given shapes. */
  setDice(shapes: readonly DieShape[]): readonly PhysicsDie[] {
    for (const d of this._dice) this.world.removeBody(d.body);
    this._dice = shapes.map((shape) => {
      const data = polyhedronFor(shape);
      const body = new CANNON.Body({
        mass: PHYSICS.diceMass,
        material: this.diceMaterial,
        allowSleep: true,
        sleepSpeedLimit: PHYSICS.sleepSpeedLimit,
        sleepTimeLimit: PHYSICS.sleepTimeLimit,
        angularDamping: PHYSICS.angularDamping,
        linearDamping: PHYSICS.linearDamping,
      });
      for (const s of dieShapes(shape, data)) body.addShape(s);
      this.world.addBody(body);
      return {
        shape,
        body,
        data,
        normals: faceNormals(data),
        readVectors: readVectors(data),
        labelOrder: null,
      };
    });
    return this._dice;
  }

  /**
   * Throws all dice: they start spread over the whole table (a shuffled grid
   * of cells at least one die apart, so none overlap), with random
   * orientation and spin, and fly off in a shared random direction with some
   * variation per die, like a handful of dice thrown together.
   */
  throwDice(rng: Rng = secureRandom): void {
    this.rng = rng;
    const { halfWidth: hw, halfDepth: hd } = this._arena;
    const spacing = 2 * Math.max(0.5, ...this._dice.map((d) => d.data.radius)) + 0.15;
    const width = Math.max(spacing, 2 * hw * PHYSICS.throwSpread);
    const depth = Math.max(spacing, 2 * hd * PHYSICS.throwSpread);
    const cols = Math.max(1, Math.floor(width / spacing));
    const rows = Math.max(1, Math.floor(depth / spacing));
    const cellW = width / cols;
    const cellD = depth / rows;
    const cells = shuffled(cols * rows, rng);
    const heading = randomBetween(0, 2 * Math.PI, rng);
    for (const d of this._dice) {
      d.labelOrder =
        this.shuffleLabels && SHUFFLED_LABEL_SHAPES.has(d.shape)
          ? shuffled(d.readVectors.length, rng)
          : null;
    }

    this._dice.forEach((d, i) => {
      const layer = Math.floor(i / cells.length);
      const cell = cells[i % cells.length]!;
      const b = d.body;
      b.position.set(
        -width / 2 +
          ((cell % cols) + 0.5) * cellW +
          randomBetween(-1, 1, rng) * ((cellW - spacing) / 2),
        PHYSICS.dropHeight + layer * spacing + randomBetween(0, 0.5, rng),
        -depth / 2 +
          (Math.floor(cell / cols) + 0.5) * cellD +
          randomBetween(-1, 1, rng) * ((cellD - spacing) / 2),
      );
      b.quaternion.copy(randomQuaternion(rng));
      const angle = heading + randomBetween(-0.6, 0.6, rng);
      const speed = randomBetween(PHYSICS.throwSpeedMin, PHYSICS.throwSpeedMax, rng);
      b.velocity.set(Math.cos(angle) * speed, randomBetween(-2, 1, rng), Math.sin(angle) * speed);
      b.angularVelocity.set(
        randomBetween(-25, 25, rng),
        randomBetween(-25, 25, rng),
        randomBetween(-25, 25, rng),
      );
      b.wakeUp();
    });
    this.elapsed = 0;
    this.nudges = 0;
    this.nudgeCounts = [];
    this.stillTime = [];
  }

  /** Advances the simulation by `dt` seconds of real time. */
  step(dt: number): void {
    this.world.step(PHYSICS.timeStep, dt, 5);
    this.elapsed += dt;
  }

  /** True once every die is asleep (at rest). */
  isSettled(): boolean {
    return this._dice.every((d) => d.body.sleepState === CANNON.Body.SLEEPING);
  }

  /**
   * How flat the die lies: 1 = some face points straight down onto the table.
   * (Uses the bottom face, which works for every shape, including a d4 that
   * has no face pointing up.)
   */
  flatness(die: PhysicsDie): number {
    return Math.max(...die.normals.map((n) => -rotatedY(die.body.quaternion, n)));
  }

  isCocked(die: PhysicsDie): boolean {
    return this.flatness(die) < PHYSICS.flatThreshold;
  }

  /**
   * Gives each die that has come to rest cocked a small random hop and spin so
   * it falls flat. Dice are handled one by one, as soon as each one rests, so
   * a big group doesn't wait for every die before nudging. Returns true if any
   * die was nudged.
   */
  private nudgeCocked(): boolean {
    let nudged = false;
    this._dice.forEach((d, i) => {
      const count = this.nudgeCounts[i] ?? 0;
      if (count >= PHYSICS.maxNudges) return;
      if (!this.isResting(i) || !this.isCocked(d)) return;
      this.nudgeCounts[i] = count + 1;
      this.nudges++;
      nudged = true;
      const b = d.body;
      // Hop toward the middle of the table, so a die leaning on a wall gets away from it.
      const toCentre =
        Math.atan2(-b.position.z, -b.position.x) + randomBetween(-0.8, 0.8, this.rng);
      const speed = randomBetween(0.5, 2.5, this.rng);
      b.velocity.set(Math.cos(toCentre) * speed, 6, Math.sin(toCentre) * speed);
      this.stillTime[i] = 0;
      b.angularVelocity.set(
        randomBetween(-10, 10, this.rng),
        randomBetween(-10, 10, this.rng),
        randomBetween(-10, 10, this.rng),
      );
      b.wakeUp();
    });
    return nudged;
  }

  /**
   * Advances a throw by `dt` seconds. Returns true when the throw is finished:
   * all dice at rest (each cocked one nudged up to maxNudges times), or the
   * timeout passed, in which case dice are frozen in place.
   */
  advance(dt: number): boolean {
    this.step(dt);
    this._dice.forEach((d, i) => {
      const b = d.body;
      const still =
        b.velocity.lengthSquared() < PHYSICS.stillSpeed ** 2 &&
        b.angularVelocity.lengthSquared() < PHYSICS.stillSpin ** 2;
      this.stillTime[i] = still ? (this.stillTime[i] ?? 0) + dt : 0;
    });
    if (this.elapsed >= PHYSICS.settleTimeoutSeconds) {
      this.freeze();
      return true;
    }
    if (this.nudgeCocked()) return false;
    if (this.isSettled()) return true;
    if (this._dice.every((_, i) => this.isResting(i))) {
      // Some dice jitter (e.g. leaning on a wall) and never fall asleep; stop them.
      this.freeze();
      return true;
    }
    return false;
  }

  /** Asleep, or barely moving for PHYSICS.stillSeconds (a jittering die may never sleep). */
  private isResting(index: number): boolean {
    const d = this._dice[index]!;
    return (
      d.body.sleepState === CANNON.Body.SLEEPING ||
      (this.stillTime[index] ?? 0) >= PHYSICS.stillSeconds
    );
  }

  /** Stops all dice where they are, so what is shown matches what is read. */
  freeze(): void {
    for (const d of this._dice) {
      d.body.velocity.setZero();
      d.body.angularVelocity.setZero();
      d.body.sleep();
    }
  }

  /**
   * Result of each die in die order: the label index on its top face (or top
   * corner for a d4), after any label shuffle.
   */
  readResults(): number[] {
    return this._dice.map((d) => {
      const face = topFaceIndex(d.readVectors, d.body.quaternion);
      return d.labelOrder ? d.labelOrder[face]! : face;
    });
  }

  /**
   * Runs a whole throw without rendering (for tests and fairness checks).
   * Returns the face indices and the simulated time it took.
   */
  simulateThrow(rng: Rng = secureRandom): {
    faces: number[];
    seconds: number;
    timedOut: boolean;
    nudges: number;
  } {
    this.throwDice(rng);
    while (!this.advance(PHYSICS.timeStep));
    return {
      faces: this.readResults(),
      seconds: this.elapsed,
      timedOut: this.elapsed >= PHYSICS.settleTimeoutSeconds,
      nudges: this.nudges,
    };
  }
}
