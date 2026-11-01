import { describe, it, expect } from 'vitest';
import * as CANNON from 'cannon-es';
import { DiceWorld, PHYSICS, randomQuaternion } from '../../src/physics/world';
import { seededRng } from '../../src/core/random';
import { SHAPES } from '../../src/core/dice';
import { resultCount } from '../../src/physics/polyhedra';

const arena = { halfWidth: 5, halfDepth: 4 };

describe('randomQuaternion', () => {
  it('returns unit quaternions', () => {
    const rng = seededRng(1);
    for (let i = 0; i < 100; i++) {
      const q = randomQuaternion(rng);
      expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1, 10);
    }
  });
});

describe('DiceWorld', () => {
  it('starts with no dice and the given arena', () => {
    const w = new DiceWorld(arena);
    expect(w.dice).toEqual([]);
    expect(w.arena).toEqual(arena);
    expect(w.isSettled()).toBe(true);
  });

  it('replaces dice when setDice is called again', () => {
    const w = new DiceWorld(arena);
    w.setDice(['d6', 'd6']);
    const bodiesBefore = w.world.bodies.length;
    w.setDice(['d6']);
    expect(w.dice).toHaveLength(1);
    expect(w.world.bodies.length).toBe(bodiesBefore - 1);
  });

  it('keeps the same number of walls after resizing', () => {
    const w = new DiceWorld(arena);
    const n = w.world.bodies.length;
    w.setArena({ halfWidth: 2, halfDepth: 6 });
    expect(w.world.bodies.length).toBe(n);
    expect(w.arena).toEqual({ halfWidth: 2, halfDepth: 6 });
  });

  it('throws a d6 that settles flat inside the arena with a valid face', () => {
    const w = new DiceWorld(arena);
    w.setDice(['d6']);
    const { faces, seconds, timedOut } = w.simulateThrow(seededRng(123));
    expect(timedOut).toBe(false);
    expect(seconds).toBeLessThan(3);
    expect(faces).toHaveLength(1);
    expect(faces[0]).toBeGreaterThanOrEqual(0);
    expect(faces[0]).toBeLessThan(6);

    const p = w.dice[0]!.body.position;
    expect(Math.abs(p.x)).toBeLessThan(arena.halfWidth);
    expect(Math.abs(p.z)).toBeLessThan(arena.halfDepth);
    expect(p.y).toBeCloseTo(0.5, 1); // resting on a face: centre at half the edge length
  });

  it('settles several dice at once, all inside the arena', () => {
    const w = new DiceWorld(arena);
    w.setDice(Array.from({ length: 6 }, () => 'd6' as const));
    const { faces, timedOut } = w.simulateThrow(seededRng(7));
    expect(timedOut).toBe(false);
    expect(faces).toHaveLength(6);
    for (const d of w.dice) {
      expect(w.isCocked(d)).toBe(false);
      expect(Math.abs(d.body.position.x)).toBeLessThan(arena.halfWidth);
      expect(Math.abs(d.body.position.z)).toBeLessThan(arena.halfDepth);
    }
  });

  it('is reproducible with the same seed', () => {
    const run = () => {
      const w = new DiceWorld(arena);
      w.setDice(['d6', 'd6']);
      return w.simulateThrow(seededRng(99)).faces;
    };
    expect(run()).toEqual(run());
  });

  it('shows every face across many throws (smoke check; full fairness test comes later)', () => {
    const w = new DiceWorld(arena);
    w.setDice(['d6']);
    const rng = seededRng(2026);
    const counts = new Array<number>(6).fill(0);
    for (let i = 0; i < 300; i++) counts[w.simulateThrow(rng).faces[0]!]!++;
    for (const c of counts) expect(c).toBeGreaterThan(20);
  });

  it('freezes dice and finishes when the settle timeout is hit', () => {
    const w = new DiceWorld(arena);
    w.setDice(['d6']);
    w.throwDice(seededRng(5));
    expect(w.advance(PHYSICS.timeStep)).toBe(false); // still flying
    expect(w.advance(PHYSICS.settleTimeoutSeconds)).toBe(true); // jump past the timeout
    const body = w.dice[0]!.body;
    expect(body.velocity.length()).toBe(0);
    expect(body.angularVelocity.length()).toBe(0);
    expect(body.sleepState).toBe(CANNON.Body.SLEEPING);
    expect(w.readResults()).toHaveLength(1);
  });

  it('keeps a die inside when thrown into a small arena', () => {
    const small = { halfWidth: 2, halfDepth: 2 };
    const w = new DiceWorld(small);
    w.setDice(['d6']);
    for (let seed = 0; seed < 20; seed++) {
      w.simulateThrow(seededRng(seed));
      const p = w.dice[0]!.body.position;
      expect(Math.abs(p.x)).toBeLessThan(small.halfWidth);
      expect(Math.abs(p.z)).toBeLessThan(small.halfDepth);
    }
  });

  it('settles a single die quickly across many throws', () => {
    const w = new DiceWorld(arena);
    w.setDice(['d6']);
    const rng = seededRng(11);
    let total = 0;
    for (let i = 0; i < 50; i++) {
      const r = w.simulateThrow(rng);
      expect(r.timedOut).toBe(false);
      total += r.seconds;
    }
    expect(total / 50).toBeLessThan(2);
  });

  it('nudges a cocked die until it lies flat', () => {
    const w = new DiceWorld(arena);
    w.setDice(['d6']);
    const die = w.dice[0]!;
    w.throwDice(seededRng(3));
    // Force the die to rest balanced on an edge (45° tilt) and asleep.
    die.body.position.set(0, 0.7, 0);
    die.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), Math.PI / 4);
    die.body.velocity.setZero();
    die.body.angularVelocity.setZero();
    die.body.sleep();
    expect(w.isCocked(die)).toBe(true);
    expect(w.flatness(die)).toBeCloseTo(Math.SQRT1_2);

    expect(w.advance(PHYSICS.timeStep)).toBe(false); // nudged instead of finishing
    expect(die.body.velocity.y).toBeGreaterThan(0);
    while (!w.advance(PHYSICS.timeStep));
    expect(w.isCocked(die)).toBe(false);
  });

  it('gives up nudging after maxNudges and accepts the result', () => {
    const w = new DiceWorld(arena);
    w.setDice(['d6']);
    const die = w.dice[0]!;
    w.throwDice(seededRng(4));
    const tilt = () => {
      die.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), Math.PI / 4);
      die.body.velocity.setZero();
      die.body.angularVelocity.setZero();
      die.body.sleep();
    };
    for (let i = 0; i < PHYSICS.maxNudges; i++) {
      tilt();
      expect(w.advance(PHYSICS.timeStep)).toBe(false);
    }
    tilt();
    expect(w.advance(PHYSICS.timeStep)).toBe(true);
  });

  it('starts mixed dice far enough apart that none overlap', () => {
    const w = new DiceWorld({ halfWidth: 8, halfDepth: 6 });
    w.setDice(['d100', 'd4', 'd100', 'd20', 'd100', 'd6', 'd100', 'd10']);
    w.throwDice(seededRng(1));
    const dice = w.dice;
    for (let i = 0; i < dice.length; i++) {
      for (let j = i + 1; j < dice.length; j++) {
        const gap = dice[i]!.body.position.distanceTo(dice[j]!.body.position);
        expect(gap).toBeGreaterThan(dice[i]!.data.radius + dice[j]!.data.radius);
      }
    }
  });

  it('settles a mixed group of every shape', () => {
    const w = new DiceWorld({ halfWidth: 7, halfDepth: 5 });
    w.setDice(SHAPES);
    const { faces, timedOut } = w.simulateThrow(seededRng(21));
    expect(timedOut).toBe(false);
    faces.forEach((f, i) => {
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(resultCount(w.dice[i]!.data));
    });
  });
});

describe.each(SHAPES)('throwing a %s', (shape) => {
  const throws = shape === 'd100' ? 150 : 120;

  it('always settles flat, quickly, inside the arena', () => {
    const w = new DiceWorld(arena);
    w.setDice([shape]);
    const die = w.dice[0]!;
    const rng = seededRng(shape.length * 1000 + 7);
    let total = 0;
    for (let i = 0; i < throws; i++) {
      const r = w.simulateThrow(rng);
      expect(r.timedOut).toBe(false);
      expect(w.isCocked(die)).toBe(false);
      expect(Math.abs(die.body.position.x)).toBeLessThan(arena.halfWidth);
      expect(Math.abs(die.body.position.z)).toBeLessThan(arena.halfDepth);
      total += r.seconds;
    }
    expect(total / throws).toBeLessThan(2.5);
  });

  it('can show many different results (smoke check; fairness is tested separately)', () => {
    const w = new DiceWorld(arena);
    w.setDice([shape]);
    const n = resultCount(w.dice[0]!.data);
    const rng = seededRng(99);
    const seen = new Set<number>();
    for (let i = 0; i < throws; i++) seen.add(w.simulateThrow(rng).faces[0]!);
    // Small dice should show every face; the d100 at least most of its faces.
    expect(seen.size).toBeGreaterThanOrEqual(shape === 'd100' ? 70 : n);
  });
});

describe('d4 flatness', () => {
  it('counts a d4 resting on a face as flat even though no face points up', () => {
    const w = new DiceWorld(arena);
    w.setDice(['d4']);
    const die = w.dice[0]!;
    const n = die.normals[0]!;
    die.body.quaternion.setFromVectors(new CANNON.Vec3(...n), new CANNON.Vec3(0, -1, 0));
    expect(w.flatness(die)).toBeCloseTo(1, 9);
    expect(w.isCocked(die)).toBe(false);
  });
});
