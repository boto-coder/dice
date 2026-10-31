/** A random number generator returning a float in [0, 1). */
export type Rng = () => number;

/**
 * Cryptographically secure RNG with 53 bits of precision.
 * Uses `crypto.getRandomValues`, which (unlike `crypto.randomUUID`) also works
 * in insecure contexts such as testing on a phone over plain LAN http.
 */
export const secureRandom: Rng = () => {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  const high = buf[0]! >>> 5; // 27 bits
  const low = buf[1]! >>> 6; // 26 bits
  return (high * 2 ** 26 + low) / 2 ** 53;
};

/** Random integer in the inclusive range [min, max]. */
export function randomInt(min: number, max: number, rng: Rng = secureRandom): number {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
    throw new RangeError(`Invalid range [${min}, ${max}]`);
  }
  return min + Math.floor(rng() * (max - min + 1));
}

/** Random float in the half-open range [min, max). */
export function randomBetween(min: number, max: number, rng: Rng = secureRandom): number {
  return min + rng() * (max - min);
}

/** Random 16-character hex identifier. */
export function randomId(): string {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}
