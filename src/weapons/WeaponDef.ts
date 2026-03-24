/**
 * Pure data record describing a weapon.
 * Adding a new weapon = one new entry in WeaponRegistry. No logic changes.
 */
export interface WeaponDef {
  readonly id:   string;
  readonly name: string;

  // Fire mode
  readonly fireMode: 'single' | 'auto'; // single = one shot per press; auto = hold to fire

  // Projectile launch
  readonly projectileSpeed:   number;  // px/s
  readonly projectileGravity: number;  // multiplier of global GRAVITY
  readonly projectileSize:    number;  // visual radius px
  readonly projectileColor:   number;  // hex colour for rendering
  readonly pellets:           number;  // >1 for shotgun-style spread
  readonly spread:            number;  // total spread arc in radians (legacy, used if distribution=0)
  readonly randomSpread?:     boolean; // true = per-pellet random spread (shotgun chaos)
  readonly velocityVariance?: number;  // fractional speed randomness, e.g. 0.1 = ±10%

  /**
   * Liero-style per-axis velocity jitter (px/s).
   * Applied to BOTH vx and vy independently:
   *   vx += random(-distribution, +distribution)
   *   vy += random(-distribution, +distribution)
   * When set, this replaces the angle-based spread system.
   */
  readonly distribution?:     number;

  // Projectile behaviour
  readonly behavior:    'normal' | 'bounce' | 'zimm' | 'mine' | 'rope';
  readonly maxBounces:  number;        // 'bounce' only — explode after this many bounces
  readonly fuseMs:      number | null; // null = explode on terrain hit; number = timed fuse
  readonly bouncePercent?: number;     // Liero bounce: perpendicular vel *= -bouncePercent/100, cross *= 4/5. 100=perfect elastic.

  // Cluster: spawn child projectiles on explosion
  readonly clusterWeapon?: string; // id of the child weapon in WeaponRegistry
  readonly clusterCount?:  number; // how many children to spawn

  // Chiquita: spawn banana fragments on explosion
  readonly chiquitaFragments?: number;

  // Worm collision: if false, projectile passes through worms without detonating
  readonly wormCollide?:  boolean; // default true for normal/zimm, false skips worm hit check

  // Sticky mine: attaches to terrain, detaches when terrain destroyed, re-attaches on landing
  readonly sticky?: boolean;

  // Proximity trigger radius in px (mines and proximity grenades)
  readonly mineProximity?: number;
  // Delay before proximity trigger activates (ms). Prevents instant self-trigger on throw.
  readonly proximityDelayMs?: number;

  // Direct hit damage (flat, no falloff — applied on worm collision before explosion)
  readonly hitDamage?:       number;

  // Owner grace: for this many ms after firing, owner is excluded from damage
  readonly ownerGraceMs?: number;

  // Trail: spawn child projectiles periodically while in flight
  readonly trailWeaponId?:   string;  // id of weapon to spawn as trail particle
  readonly trailIntervalMs?: number;  // spawn interval in ms

  // Explosion
  readonly explosionRadius: number;
  readonly splashDamage:    number;
  readonly splashRadius:    number;

  // Recoil: impulse applied to shooter opposite to aim direction (px/s)
  readonly recoilForce?:    number;

  // Ammo & reload (magazine system)
  readonly ammoPerMag:     number;  // shots per magazine
  readonly totalAmmo:      number;  // total reserve ammo (10000 = effectively unlimited)
  readonly infiniteAmmo:   boolean;
  readonly delayMs:        number;  // delay between shots within magazine (ms)
  readonly loadingTimeMs:  number;  // time to reload full magazine when empty (ms)
}
