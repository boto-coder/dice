import * as CANNON from 'cannon-es';
import type { DieShape } from '../core/dice';
import { randomBetween, secureRandom, type Rng } from '../core/random';
import { rotatedY, topFaceIndex } from './faceReading';
import {
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
  floorFriction: 0.25,
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
} as const;

export interface PhysicsDie {
  readonly shape: DieShape;
  readonly body: CANNON.Body;
  readonly data: PolyhedronData;
  /** Outward face normals (for flatness checks). */
  readonly normals: readonly Vec3Tuple[];
  /** Directions that decide the result: face normals, or corner directions for a d4. */
  readonly readVectors: readonly Vec3Tuple[];
}

function toConvex(data: PolyhedronData): CANNON.ConvexPolyhedron {
  return new CANNON.ConvexPolyhedron({
    vertices: data.vertices.map(([x, y, z]) => new CANNON.Vec3(x, y, z)),
    faces: data.faces.map((f) => [...f]),
  });
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
      shape: new CANNON.Plane(),
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
        shape: new CANNON.Plane(),
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
        shape: toConvex(data),
        material: this.diceMaterial,
        allowSleep: true,
        sleepSpeedLimit: PHYSICS.sleepSpeedLimit,
        sleepTimeLimit: PHYSICS.sleepTimeLimit,
        angularDamping: PHYSICS.angularDamping,
        linearDamping: PHYSICS.linearDamping,
      });
      this.world.addBody(body);
      return { shape, body, data, normals: faceNormals(data), readVectors: readVectors(data) };
    });
    return this._dice;
  }

  /**
   * Throws all dice from the left side toward random points on the table,
   * with random orientation, speed and spin. Dice start in a spaced 3D grid
   * so they never overlap, and each aims at its own target so they spread out.
   */
  throwDice(rng: Rng = secureRandom): void {
    this.rng = rng;
    const { halfWidth: hw, halfDepth: hd } = this._arena;
    // Spread starting positions by the largest die so none overlap.
    const spacing = 2 * Math.max(0.5, ...this._dice.map((d) => d.data.radius)) + 0.15;
    const perColumn = Math.max(1, Math.floor((hd * 1.6) / spacing) + 1);
    const perLayer = perColumn * 2;
    this._dice.forEach((d, i) => {
      const layer = Math.floor(i / perLayer);
      const col = Math.floor((i % perLayer) / perColumn);
      const row = i % perColumn;
      const usedRows = Math.min(perColumn, this._dice.length);
      const b = d.body;
      b.position.set(
        -hw * 0.75 + col * spacing + randomBetween(-0.1, 0.1, rng),
        PHYSICS.dropHeight + layer * spacing + randomBetween(0, 0.5, rng),
        (row - (usedRows - 1) / 2) * spacing + randomBetween(-0.1, 0.1, rng),
      );
      b.quaternion.copy(randomQuaternion(rng));
      const tx = randomBetween(-hw * 0.2, hw * 0.7, rng);
      const tz = randomBetween(-hd * 0.7, hd * 0.7, rng);
      const dx = tx - b.position.x;
      const dz = tz - b.position.z;
      const speed = 1.5 + randomBetween(0.2, 0.5, rng) * Math.hypot(dx, dz) * 2;
      const len = Math.hypot(dx, dz) || 1;
      b.velocity.set((dx / len) * speed, randomBetween(-2, 1, rng), (dz / len) * speed);
      b.angularVelocity.set(
        randomBetween(-25, 25, rng),
        randomBetween(-25, 25, rng),
        randomBetween(-25, 25, rng),
      );
      b.wakeUp();
    });
    this.elapsed = 0;
    this.nudges = 0;
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

  /** Gives each cocked die a small random hop and spin so it falls flat. */
  private nudgeCocked(): boolean {
    const cocked = this._dice.filter((d) => this.isCocked(d));
    if (cocked.length === 0 || this.nudges >= PHYSICS.maxNudges) return false;
    this.nudges++;
    for (const d of cocked) {
      const b = d.body;
      b.velocity.set(randomBetween(-2, 2, this.rng), 6, randomBetween(-2, 2, this.rng));
      b.angularVelocity.set(
        randomBetween(-10, 10, this.rng),
        randomBetween(-10, 10, this.rng),
        randomBetween(-10, 10, this.rng),
      );
      b.wakeUp();
    }
    return true;
  }

  /**
   * Advances a throw by `dt` seconds. Returns true when the throw is finished:
   * all dice at rest (cocked ones nudged up to maxNudges times), or the
   * timeout passed, in which case dice are frozen in place.
   */
  advance(dt: number): boolean {
    this.step(dt);
    if (this.elapsed >= PHYSICS.settleTimeoutSeconds) {
      this.freeze();
      return true;
    }
    if (!this.isSettled()) return false;
    return !this.nudgeCocked();
  }

  /** Stops all dice where they are, so what is shown matches what is read. */
  freeze(): void {
    for (const d of this._dice) {
      d.body.velocity.setZero();
      d.body.angularVelocity.setZero();
      d.body.sleep();
    }
  }

  /** Logical result index of each die (top face, or top corner for a d4), in die order. */
  readResults(): number[] {
    return this._dice.map((d) => topFaceIndex(d.readVectors, d.body.quaternion));
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
