/**
 * Pure data record describing a weapon. No logic here.
 * Adding a new weapon = adding a new WeaponDef to WeaponRegistry.
 */
export interface WeaponDef {
  readonly id: string;
  readonly name: string;

  // Projectile launch
  readonly projectileSpeed:   number;  // px/s
  readonly projectileGravity: number;  // multiplier of global GRAVITY (0 = no arc, 1 = normal)
  readonly projectileSize:    number;  // visual radius px

  // Explosion
  readonly explosionRadius: number;  // terrain carve radius px
  readonly splashDamage:    number;  // max damage at explosion centre
  readonly splashRadius:    number;  // falloff radius px

  // Ammo + fire rate
  readonly ammoMax:   number;
  readonly reloadMs:  number;  // ms between shots
}
