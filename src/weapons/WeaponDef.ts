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
  readonly pellets:           number;  // >1 for shotgun-style spread
  readonly spread:            number;  // total spread arc in radians

  // Projectile behaviour
  readonly behavior:    'normal' | 'bounce' | 'rope';
  readonly maxBounces:  number;        // 'bounce' only — explode after this many bounces
  readonly fuseMs:      number | null; // null = explode on terrain hit; number = timed fuse

  // Explosion
  readonly explosionRadius: number;
  readonly splashDamage:    number;
  readonly splashRadius:    number;

  // Ammo
  readonly ammoMax:      number;
  readonly infiniteAmmo: boolean;
  readonly reloadMs:     number;
}
