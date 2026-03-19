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

  // Mine: proximity trigger radius in px (behavior === 'mine' only)
  readonly mineProximity?: number;

  // Explosion
  readonly explosionRadius: number;
  readonly splashDamage:    number;
  readonly splashRadius:    number;

  /**
   * If true, when this projectile hits terrain/worm it also triggers a small_explosion
   * (radius=8, damage=5, splash=16). Used by damage particles/fragments for chain damage.
   */
  readonly fragmentExplosion?: boolean;

  // Ammo
  readonly ammoMax:      number;
  readonly infiniteAmmo: boolean;
  readonly reloadMs:     number;
}
