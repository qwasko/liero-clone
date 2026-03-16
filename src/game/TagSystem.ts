import { Worm } from '../entities/Worm';

/**
 * Tracks who is "it" and how long each worm has been "it".
 *
 * Rules:
 *  - First death → that worm becomes "it".
 *  - When "it" dies → the other worm becomes "it".
 *  - Non-"it" death → no change.
 *  - Winner = least cumulative time as "it".
 */
export class TagSystem {
  private itWorm: Worm | null = null;
  private timeAsIt: Map<Worm, number> = new Map();
  private readonly worms: readonly Worm[];

  constructor(worms: readonly Worm[]) {
    this.worms = worms;
    for (const w of worms) this.timeAsIt.set(w, 0);
  }

  get it(): Worm | null { return this.itWorm; }

  isIt(worm: Worm): boolean { return this.itWorm === worm; }

  /** Accumulate time for the current "it" worm. Call once per frame. */
  update(dt: number): void {
    if (this.itWorm) {
      this.timeAsIt.set(this.itWorm, (this.timeAsIt.get(this.itWorm) ?? 0) + dt);
    }
  }

  /**
   * Called once per worm death (same frame the death is first detected).
   * Transfers "it" tag according to the rules above.
   */
  onDeath(deadWorm: Worm): void {
    if (this.itWorm === null) {
      // First death in the match — dead worm becomes "it"
      this.itWorm = deadWorm;
    } else if (this.itWorm === deadWorm) {
      // "it" died — pass the tag to the other worm
      const other = this.worms.find(w => w !== deadWorm) ?? null;
      this.itWorm = other;
    }
    // Non-"it" death: no change
  }

  getTime(worm: Worm): number {
    return this.timeAsIt.get(worm) ?? 0;
  }

  /** Determine match result based on accumulated "it" time. */
  result(worm1: Worm, worm2: Worm): { winner: 0 | 1 | 2; times: [number, number] } {
    const t1 = this.getTime(worm1);
    const t2 = this.getTime(worm2);
    let winner: 0 | 1 | 2;
    if (t1 < t2)      winner = 1;
    else if (t2 < t1) winner = 2;
    else              winner = 0;
    return { winner, times: [t1, t2] };
  }
}
