import { describe, it, expect } from 'vitest';
import * as CANNON from 'cannon-es';
import { DiceWorld, PHYSICS, randomQuaternion } from '../../src/physics/world';
import { seededRng } from '../../src/core/random';

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
});
