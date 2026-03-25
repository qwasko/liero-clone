/**
 * Deterministic pseudo-random number generator (mulberry32).
 * Used for lockstep multiplayer: same seed → same sequence on both clients.
 *
 * Usage:
 *   const rng = new SeededRNG(12345);
 *   rng.next();          // 0..1  (like Math.random())
 *   rng.nextInt(10);     // 0..9
 *   rng.nextRange(5,15); // 5..15 (float)
 */
export class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  /** Returns a float in [0, 1). Drop-in replacement for Math.random(). */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns an integer in [0, max). */
  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }

  /** Returns a float in [min, max). */
  nextRange(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Resets the generator to a new seed. */
  reseed(seed: number): void {
    this.state = seed | 0;
  }

  /** Returns current internal state (for serialization/debugging). */
  getState(): number {
    return this.state;
  }
}

/** Generate a random seed for a new match. Uses Math.random (non-deterministic). */
export function generateMatchSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}
